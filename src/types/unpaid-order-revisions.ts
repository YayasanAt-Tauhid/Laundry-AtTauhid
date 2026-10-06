export type RevisionSnapshot = Record<string, string | number | null>;

export type UnpaidOrderRevision = {
  id: string;
  order_id: string;
  old_student_id: string;
  new_student_id: string;
  old_partner_id: string;
  new_partner_id: string;
  reason: string;
  before_snapshot: RevisionSnapshot;
  after_snapshot: RevisionSnapshot;
  corrected_by: string;
  corrected_at: string;
};
