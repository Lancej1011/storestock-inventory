import { describe, it, expect } from 'vitest';
import { matchOCRToProducts } from './ocr';

describe('OCR Matching Logic', () => {
  const mockProducts = [
    { id: '1', name: 'Coca-Cola 500ml', barcode: '12345' },
    { id: '2', name: 'Pepsi 500ml', barcode: '67890' },
    { id: '3', name: 'Oreo Biscuits 150g', barcode: '11111' },
  ];

  it('should find exact name match', () => {
    const ocrResult = {
      rawText: 'Enjoy a refreshing Coca-Cola 500ml today',
      words: ['Coca-Cola', '500ml'],
      possibleBrand: 'Coca-Cola',
      possibleProductName: '500ml',
      confidence: 90,
    };

    const match = matchOCRToProducts(ocrResult, mockProducts);
    expect(match).not.toBeNull();
    expect(match?.product.id).toBe('1');
    expect(match?.matchType).toBe('exact');
  });

  it('should find brand match', () => {
    const ocrResult = {
      rawText: 'New Pepsi with lemon',
      words: ['Pepsi', 'lemon'],
      possibleBrand: 'Pepsi',
      possibleProductName: 'lemon',
      confidence: 80,
    };

    const match = matchOCRToProducts(ocrResult, mockProducts);
    expect(match).not.toBeNull();
    expect(match?.product.id).toBe('2');
    expect(match?.matchType).toBe('brand');
  });

  it('should find partial match', () => {
    const ocrResult = {
      rawText: 'Oreo chocolate cookies',
      words: ['Oreo', 'chocolate'],
      possibleBrand: null,
      possibleProductName: 'Oreo chocolate',
      confidence: 70,
    };

    const match = matchOCRToProducts(ocrResult, mockProducts);
    expect(match).not.toBeNull();
    expect(match?.product.id).toBe('3');
    expect(match?.matchType).toBe('partial');
  });

  it('should return null if no match found', () => {
    const ocrResult = {
      rawText: 'Unknown product text',
      words: ['Unknown'],
      possibleBrand: null,
      possibleProductName: null,
      confidence: 50,
    };

    const match = matchOCRToProducts(ocrResult, mockProducts);
    expect(match).toBeNull();
  });
});
