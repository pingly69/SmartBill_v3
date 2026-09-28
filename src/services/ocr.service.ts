import { Env } from '../config';
import { AnalyzeOcrResponse } from '../types/api';

export async function analyzeInvoice(
  env: Env,
  base64Image: string,
  mimeType = 'image/jpeg'
): Promise<AnalyzeOcrResponse> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment variables');
  }

  const model = env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  // Strict OCR Prompt matching Appendix A & Rule 6 of migration specification
  const systemPrompt = `คุณคือผู้เชี่ยวชาญด้านบัญชีไทยที่มีความแม่นยำระดับสูงสุดในการอ่านลายมือเขียนและเอกสารบิลใบเสร็จ ใบกำกับภาษีของไทย
กฎเหล็กและคำสั่งควบคุม (OCR Strict Logic):
1. การสกัดวันที่ (Date Extraction):
   - อ่านวันที่จากภาพตามที่ปรากฏ (เช่น "25/ม.ค./69", "25-01-2569", "25 Jan 2026")
   - หากพบชื่อเดือนภาษาไทย ให้แปลงเป็นตัวเลขเดือนตามเงื่อนไขนี้เสมอ:
     (ม.ค.=01, ก.พ.=02, มี.ค.=03, เม.ย.=04, พ.ค.=05, มิ.ย.=06, ก.ค.=07, ส.ค.=08, ก.ย.=09, ต.ค.=10, พ.ย.=11, ธ.ค.=12)
   - หากปีที่ปรากฏเป็น พ.ศ. (เช่น 69 หรือ 2569 หรือมากกว่าเลขนี้) ให้ลบด้วย 543 เพื่อแปลงเป็น ค.ศ. (เช่น 2026) หากเป็น ค.ศ. อยู่แล้ว ห้ามลบซ้ำ
   - ส่งกลับในรูปแบบ YYYY-MM-DD เท่านั้น
2. กฎเรื่องภาษี (VAT & Calculations) สำคัญมาก:
   - ห้ามคำนวณ VAT 7% เพิ่มเองโดยพลการเด็ดขาด (Do NOT calculate VAT yourself)
   - หากในบิลไม่มีบรรทัดที่ระบุภาษีมูลค่าเพิ่มหรือ VAT ให้ใส่ vatAmount = 0.00 ทันที
   - ในกรณีไม่มี VAT: ยอดรวม (totalAmount) ต้องเท่ากับยอดก่อน VAT (preVat)
   - หากเป็น "บิลเงินสด" หรือ "ใบเสร็จรับเงิน" ที่เขียนมือ มักจะไม่มี VAT ให้ตรวจสอบยอดรวมที่ระบุไว้เป็นหลัก
3. เลขประจำตัวผู้เสียภาษี (Tax ID):
   - ดึงเฉพาะตัวเลข 13 หลักของผู้ขาย (ไม่รวมเว้นวรรคหรือขีด) ถ้าหาไม่เจอให้ส่งค่าว่าง ""
4. สาขา (Branch Code):
   - หากพบคืนค่า เช่น 00000 หรือ สำนักงานใหญ่ ให้ส่ง "00000" หรือตามเลขสาขาที่ระบุ (5 หลัก)
5. เลขที่บิล (Bill Number):
   - เลขที่ใบเสร็จ หรือ เลขที่เอกสาร (Tax_docno)
6. ชื่อผู้ขาย (Seller Name):
   - ชื่อบริษัท ร้านค้า หรือผู้รับเงิน
7. รายการสินค้า/บริการ (Expense Note):
   - สรุปรายการสินค้า ค่าใช้จ่าย หรือบริการสั้นๆ กระชับ
8. ตอบกลับเป็น JSON บริสุทธิ์เท่านั้นตาม Schema ที่กำหนด`;

  const payload = {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          { text: 'ช่วยสกัดข้อมูลจากภาพบิลนี้ตามกฎอย่างเคร่งครัดและส่งคืนผลลัพธ์เป็น JSON Schema' },
          {
            inline_data: {
              mime_type: mimeType,
              data: base64Image,
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        properties: {
          taxId: { type: 'string' },
          sellerName: { type: 'string' },
          branchCode: { type: 'string' },
          billNumber: { type: 'string' },
          billDate: { type: 'string', description: 'YYYY-MM-DD format in CE year' },
          preVat: { type: 'number' },
          vatAmount: { type: 'number' },
          totalAmount: { type: 'number' },
          expenseNote: { type: 'string' },
        },
        required: [
          'taxId',
          'sellerName',
          'branchCode',
          'billNumber',
          'billDate',
          'preVat',
          'vatAmount',
          'totalAmount',
        ],
      },
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API Error (${response.status}): ${errorText}`);
  }

  const jsonResult: any = await response.json();
  const textContent = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textContent) {
    throw new Error('Gemini API returned an empty response');
  }

  const parsed = JSON.parse(textContent);

  // Fallback cleanup
  let cleanDate = parsed.billDate || '';
  if (cleanDate.includes('/')) {
    const parts = cleanDate.split('/');
    if (parts.length === 3) {
      // If DD/MM/YYYY -> convert to YYYY-MM-DD
      cleanDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }

  return {
    taxId: (parsed.taxId || '').replace(/\D/g, '').slice(0, 13),
    sellerName: (parsed.sellerName || '').trim(),
    branchCode: (parsed.branchCode || '00000').padStart(5, '0').slice(0, 5),
    billNumber: (parsed.billNumber || '').trim(),
    billDate: cleanDate,
    preVat: Number(parsed.preVat) || 0.0,
    vatAmount: Number(parsed.vatAmount) || 0.0,
    totalAmount: Number(parsed.totalAmount) || (Number(parsed.preVat) || 0.0) + (Number(parsed.vatAmount) || 0.0),
    expenseNote: (parsed.expenseNote || '').trim(),
  };
}
