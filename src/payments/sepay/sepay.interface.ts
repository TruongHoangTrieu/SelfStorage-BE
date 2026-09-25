export interface SePayWebhookPayload {
  id: number;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  code?: string | null;
  content?: string;
  transferType?: 'in' | 'out';
  transferAmount?: number;
  accumulated?: number;
  subAccount?: string | null;
  referenceCode?: string | null;
  description?: string | null;
  // SePay PG IPN fields
  order_invoice_number?: string;
  order_amount?: number;
  transaction_id?: string | number;
  payment_status?: string;
  signature?: string;
}

export interface VietQRParams {
  bankCode: string;
  accountNumber: string;
  accountName?: string;
  amount: number;
  description: string;
}

export interface PaymentQrInfo {
  qrCodeUrl: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  amount: number;
  transferContent: string;
}

export interface SePayCheckoutInfo {
  checkoutUrl: string;
  formFields: Record<string, any>;
}
