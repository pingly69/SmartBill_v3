export type BillStatus = 'pending' | 'paided' | 'approved' | 'rejected';

export interface ApproverDTO {
  approve_request: string;
  line_profile?: string;
  line_uid: string;
  pettycash_approve?: string;
  emp_no?: string;
  pc_limit?: number;
}

export interface UserProfileDTO {
  found: boolean;
  request_name?: string;
  emp_no?: string;
  pc_limit?: number;
  line_uid?: string;
  error?: string;
}

export interface InitialDataResponse {
  profile: UserProfileDTO;
  approvers: ApproverDTO[];
}

export interface SubmitBillRequest {
  taxId: string;
  sellerName: string;
  branchCode: string;
  billNumber: string;
  billDate: string; // YYYY-MM-DD
  preVat: number | string;
  vatAmount: number | string;
  projectCode: string;
  expenseNote: string;
  reqType?: string; // Default '2'
  approve_request: string;
  approve_line_uid?: string;
  requesterName: string;
  lineUserId: string;
  lineEmail?: string;
  base64Image?: string;
  mimeType?: string;
}

export interface SubmitBillResponse {
  success: boolean;
  message: string;
  record_id?: string;
  status?: BillStatus;
  fileUrl?: string;
}

export interface BillItemDTO {
  record_id: string;
  created_at: string;
  tax_id: string;
  Vend_name: string;
  Tax_docno: string;
  doc_date: string; // Format DD/MM/YYYY
  Net: number;
  amt: number;
  vat: number;
  project: string;
  Remark: string;
  approve_request: string;
  status: BillStatus;
  pettycash_batch_id: string;
  pic_bill: string;
}

export interface BillSummaryDTO {
  totalBills: number;
  pendingCount: number;
  paidedCount: number;
  approvedCount: number;
  rejectedCount: number;
  totalNet: number;
  pendingNet: number;
  paidedNet: number;
  approvedNet: number;
}

export interface MyBillsResponse {
  summary: BillSummaryDTO;
  bills: BillItemDTO[];
}

export interface AnalyzeOcrRequest {
  base64: string;
  type: string;
}

export interface AnalyzeOcrResponse {
  taxId: string;
  sellerName: string;
  branchCode: string;
  billNumber: string;
  billDate: string; // YYYY-MM-DD
  preVat: number;
  vatAmount: number;
  totalAmount: number;
  expenseNote: string;
}
