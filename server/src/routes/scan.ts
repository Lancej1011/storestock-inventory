import { Router, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { AppError } from '../middleware/errorHandler.js';

const router = Router();
const prisma = new PrismaClient();

const aisleContextSchema = z.object({
  aisleNumber: z.string(),
  description: z.string().optional(),
  categories: z.array(z.string()).optional().default([]),
  recentItems: z.array(z.string()).optional().default([]),
});

const identifySchema = z.object({
  image: z.string().min(1),
  mimeType: z.string().optional().default('image/jpeg'),
  ocrText: z.string().optional(),
  aisleContext: aisleContextSchema.optional(),
});

router.post('/identify', authenticate, async (req: AuthRequest, res: Response, next) => {
  try {
    const { image, mimeType, ocrText, aisleContext } = identifySchema.parse(req.body);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new AppError('Gemini API key not configured', 500);
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const ocrSection = ocrText?.trim()
      ? `\n\nOCR text was extracted from the product label — use it to determine the exact variant, flavor, size, or weight:\n<ocr_label_text>\n${ocrText.trim()}\n</ocr_label_text>\nPrioritize OCR label text for variant/flavor/size disambiguation.`
      : '';

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

    const prompt = `You are a retail product identification assistant. Analyze this image and identify any product visible.${aisleSection}${ocrSection}

Return ONLY a valid JSON object with these exact fields (no markdown, no explanation):
{
  "brand": "brand or manufacturer name, or null if unclear",
  "name": "product name, or null if unclear",
  "variant": "size, flavor, or variant like '500ml' or 'Original', or null",
  "category": "one of: beverage, snack, cleaning, personal_care, food, electronics, household, other, or null",
  "confidence": 0.85,
  "searchTerms": ["keyword1", "keyword2", "keyword3"]
}

searchTerms should be 2-5 keywords a person would use to find this product in an inventory database.
If you cannot identify any product, return confidence: 0 and null for all other fields except searchTerms which should be [].`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: mimeType as string,
          data: image,
        },
      },
    ]);

    const text = result.response.text().trim();

    let identified: {
      brand: string | null;
      name: string | null;
      variant: string | null;
      category: string | null;
      confidence: number;
      searchTerms: string[];
    };

    try {
      const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
      identified = JSON.parse(cleaned);
    } catch {
      throw new AppError('Failed to parse AI response', 500);
    }

    // Search database using identified terms
    const searchTerms: string[] = Array.isArray(identified.searchTerms) ? identified.searchTerms : [];
    if (identified.brand) searchTerms.push(identified.brand);
    if (identified.name) searchTerms.push(identified.name);

    let matches: object[] = [];

    if (searchTerms.length > 0) {
      const orConditions = searchTerms.flatMap((term) => [
        { name: { contains: term, mode: 'insensitive' as const } },
        { description: { contains: term, mode: 'insensitive' as const } },
        { sku: { contains: term, mode: 'insensitive' as const } },
      ]);

      matches = await prisma.product.findMany({
        where: {
          isActive: true,
          OR: orConditions,
        },
        take: 5,
        include: {
          category: { select: { id: true, name: true } },
          images: { where: { isPrimary: true }, select: { imageUrl: true } },
        },
      });
    }

    res.json({ identified, matches });
  } catch (error) {
    next(error);
  }
});

export default router;
