export type CostCenterDto = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description: string | null;
  ohadaClass: number;
  relatedAccountCode: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CostCenterTemplateInfo = {
  key: string;
  labelEn: string;
  labelFr: string;
  ohadaNote: string;
};
