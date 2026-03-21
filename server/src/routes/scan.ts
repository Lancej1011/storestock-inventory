import { Router, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const prisma = new PrismaClient();

// ─── Types ────────────────────────────────────────────────────────────────────

type IdentifiedProduct = {
  brand: string | null;
  name: string | null;
  variant: string | null;
  description: string | null;
  size: string | null;
  category: string | null;
  confidence: number;
  quantity: number;
  searchTerms: string[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a short human-readable label for a product */
function productLabel(p: IdentifiedProduct): string {
  return [p.brand, p.name, p.variant].filter(Boolean).join(' ') || 'Unknown';
}

/** Fetch recent confirmed/corrected feedback to inject as training context */
async function getRecentFeedbackContext(): Promise<string> {
  const feedback = await prisma.scanFeedback.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
  });

  if (feedback.length === 0) return '';

  const lines = feedback.map((f) => {
    const corrected = f.correctedResult as IdentifiedProduct;
    const original  = f.geminiResult  as IdentifiedProduct;
    if (f.wasCorrect) {
      return `- CONFIRMED: "${productLabel(corrected)}" (${corrected.variant ?? 'no variant'})`;
    } else {
      return `- CORRECTION: AI said "${productLabel(original)}" but correct answer was "${productLabel(corrected)}" (${corrected.variant ?? 'no variant'})`;
    }
  });

  return `\n\nPast scan feedback from this store (use to improve accuracy):\n${lines.join('\n')}`;
}

/** Search inventory for a single identified product */
async function findInventoryMatches(identified: IdentifiedProduct) {
  const searchTerms: string[] = Array.isArray(identified.searchTerms)
    ? [...identified.searchTerms]
    : [];
  if (identified.brand) searchTerms.push(identified.brand);
  if (identified.name)  searchTerms.push(identified.name);

  if (searchTerms.length === 0) return [];

  const orConditions = searchTerms.flatMap((term) => [
    { name:        { contains: term, mode: 'insensitive' as const } },
    { description: { contains: term, mode: 'insensitive' as const } },
    { sku:         { contains: term, mode: 'insensitive' as const } },
  ]);

  return prisma.product.findMany({
    where: { isActive: true, OR: orConditions },
    take: 5,
    include: {
      category: { select: { id: true, name: true } },
      images:   { where: { isPrimary: true }, select: { imageUrl: true } },
    },
  });
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const aisleContextSchema = z.object({
  aisleNumber: z.string(),
  description: z.string().optional(),
  categories: z.array(z.string()).optional().default([]),
  recentItems: z.array(z.string()).optional().default([]),
});

const identifySchema = z.object({
  image:       z.string().min(1),
  mimeType:    z.string().optional().default('image/jpeg'),
  ocrText:     z.string().optional(),
  aisleContext: aisleContextSchema.optional(),
});

// ─── POST /identify ───────────────────────────────────────────────────────────

router.post('/identify', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { image, mimeType, ocrText, aisleContext } = identifySchema.parse(req.body);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new AppError('Gemini API key not configured', 500);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    // Inject past corrections as training context
    const feedbackContext = await getRecentFeedbackContext();

    // Build OCR section if provided
    const ocrSection = ocrText?.trim()
      ? `\n\nOCR text was extracted from the product label — use it to determine the exact variant, flavor, size, or weight:\n<ocr_label_text>\n${ocrText.trim()}\n</ocr_label_text>\nPrioritize OCR label text for variant/flavor/size disambiguation.`
      : '';

    // Build aisle context section if provided
    let aisleSection = '';
    if (aisleContext) {
      const { aisleNumber, description, categories = [], recentItems = [] } = aisleContext;
      const aisleLabel = description
        ? `Aisle ${aisleNumber} — ${description}`
        : `Aisle ${aisleNumber}`;
      const catLine = categories.length > 0
        ? `Common categories in this aisle: ${categories.join(', ')}.`
        : '';
      const recentLine = recentItems.length > 0
        ? `Last ${recentItems.length} item${recentItems.length > 1 ? 's' : ''} scanned in this session: ${recentItems.join(', ')}.`
        : '';
      aisleSection = `\n\nScanning context: ${aisleLabel}. ${catLine} ${recentLine}\nUse this location context to narrow down which specific product variant this is likely to be.`.trimEnd();
    }

    const prompt = `You are a retail product identification assistant. Analyze this image and identify ALL distinct product types visible.${aisleSection}${ocrSection}

Return ONLY a valid JSON array (no markdown, no explanation). One object per distinct product type:
[
  {
    "brand": "brand or manufacturer name, or null if unclear",
    "name": "product name, or null if unclear",
    "variant": "flavor or variant like 'Original' or 'Sweet Chili', or null",
    "description": "one sentence describing the product, or null",
    "size": "weight or size exactly as printed on packaging like '9.25oz', '500ml', '1kg', or null",
    "category": "one of: beverage, snack, cleaning, personal_care, food, electronics, household, other, or null",
    "confidence": 0.85,
    "quantity": 1,
    "searchTerms": ["keyword1", "keyword2", "keyword3"]
  }
]

Rules:
- Include ALL distinct product types visible in the image, not just the primary one
- Set "quantity" to how many units of that product type are visible
- searchTerms: 2-5 keywords a person would use to find the product in an inventory database
- If you cannot identify any product, return an array with one object with confidence 0 and null fields
- Pay close attention to variant details (flavor, size, colour) — past corrections show these are commonly confused${feedbackContext}`;

    let text: string;
    try {
      const result = await model.generateContent([
        prompt,
        { inlineData: { mimeType: mimeType as string, data: image } },
      ]);
      text = result.response.text().trim();
    } catch (geminiError: any) {
      console.error('Gemini API error:', geminiError?.message || geminiError);
      throw new AppError(`AI service error: ${geminiError?.message || 'Unknown error'}`, 502);
    }

    let identifiedList: IdentifiedProduct[];
    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      const parsed  = JSON.parse(cleaned);
      identifiedList = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      console.error('Failed to parse Gemini response:', text);
      throw new AppError('Failed to parse AI response', 500);
    }

    // Run inventory search for each identified product in parallel
    const products = await Promise.all(
      identifiedList.map(async (identified) => ({
        identified,
        matches: await findInventoryMatches(identified),
      }))
    );

    res.json({ products });
  } catch (error) {
    next(error);
  }
});

// ─── POST /feedback ───────────────────────────────────────────────────────────

const feedbackSchema = z.object({
  imageThumb:      z.string().min(1),          // compressed base64 thumbnail
  geminiResult:    z.record(z.unknown()),       // original AI output
  correctedResult: z.record(z.unknown()),       // confirmed or corrected values
  wasCorrect:      z.boolean(),
  productId:       z.string().uuid().optional(),
});

router.post('/feedback', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const data = feedbackSchema.parse(req.body);

    const feedback = await prisma.scanFeedback.create({
      data: {
        userId:          req.user!.userId,
        imageThumb:      data.imageThumb,
        geminiResult:    data.geminiResult,
        correctedResult: data.correctedResult,
        wasCorrect:      data.wasCorrect,
        productId:       data.productId ?? null,
      },
    });

    res.status(201).json({ id: feedback.id, saved: true });
  } catch (error) {
    next(error);
  }
});

// ─── GET /feedback/stats ──────────────────────────────────────────────────────

router.get('/feedback/stats', authenticate, async (_req: AuthRequest, res: Response, next) => {
  try {
    const [total, correct, recent] = await Promise.all([
      prisma.scanFeedback.count(),
      prisma.scanFeedback.count({ where: { wasCorrect: true } }),
      prisma.scanFeedback.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          wasCorrect:      true,
          correctedResult: true,
          createdAt:       true,
        },
      }),
    ]);

    res.json({
      total,
      correct,
      accuracy: total > 0 ? Math.round((correct / total) * 100) : null,
      recent,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
