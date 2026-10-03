export type BillingPlan = {
  enabled: boolean;
  testMode: boolean;
  unitAmount: number | null;
  currency: 'eur';
  interval: 'month';
  taxBehavior: 'inclusive' | 'exclusive' | 'unspecified';
  premiumStorageMb: number;
};
export type BillingStatus = {
  status: string;
  premium: boolean;
  canManage: boolean;
  cancelAtPeriodEnd: boolean;
  maxStorageMb: number;
};
export const PREMIUM_MONTHLY_CENTS = 1099;
