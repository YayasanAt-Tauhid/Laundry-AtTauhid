import { cn } from '@/lib/utils';
import { ORDER_STATUS, type OrderStatus } from '@/lib/constants';

interface StatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const statusStyles: Record<OrderStatus, string> = {
  DRAFT: 'bg-muted text-muted-foreground',
  MENUNGGU_APPROVAL_MITRA: 'bg-warning/10 text-warning border border-warning/20',
  DITOLAK_MITRA: 'bg-destructive/10 text-destructive border border-destructive/20',
  DISETUJUI_MITRA: 'bg-accent/10 text-accent border border-accent/20',
  MENUNGGU_PEMBAYARAN: 'bg-primary/10 text-primary border border-primary/20',
  DIBAYAR: 'bg-success/10 text-success border border-success/20',
  SELESAI: 'bg-success/10 text-success border border-success/20',
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const statusInfo = ORDER_STATUS[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium',
        statusStyles[status],
        className
      )}
    >
      {statusInfo?.label || status}
    </span>
  );
}
