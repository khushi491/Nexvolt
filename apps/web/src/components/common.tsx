'use client';
import {
  BOOKING_STATUS_DISPLAY,
  CONNECTOR_LABELS,
  formatINR,
  type BookingStatus,
  type ConnectorType,
  type LineItem,
} from '@nexvolt/shared';
import { AlertTriangle, BadgeCheck, Inbox, RefreshCw, ShieldAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { errorMessage } from '@/lib/api';
import { label } from '@/lib/utils';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Dialog, DialogContent } from './ui/dialog';
import { Field, Textarea } from './ui/input';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate-strong">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="rounded-full bg-teal-soft p-3 text-teal-strong">
        {icon ?? <Inbox className="h-6 w-6" aria-hidden />}
      </div>
      <p className="font-semibold text-navy">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-strong">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="rounded-full bg-danger-soft p-3 text-danger-strong">
        <AlertTriangle className="h-6 w-6" aria-hidden />
      </div>
      <p className="font-semibold text-navy">Couldn’t load this</p>
      <p className="max-w-sm text-sm text-slate-strong">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" /> Try again
        </Button>
      )}
    </div>
  );
}

export function StatsCard({
  label: l,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'warning' | 'danger';
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-strong">{l}</p>
        <p
          className={`mt-2 text-2xl font-bold ${tone === 'danger' ? 'text-danger-strong' : tone === 'warning' ? 'text-warning-strong' : 'text-navy'}`}
        >
          {value}
        </p>
        {hint && <p className="mt-1 text-xs text-slate-strong">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export const Money = ({ minor, className }: { minor: number; className?: string }) => (
  <span className={`tabular-nums ${className ?? ''}`}>
    {formatINR(minor, { showPaise: minor % 100 !== 0 })}
  </span>
);

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  const d = BOOKING_STATUS_DISPLAY[status];
  return <Badge tone={d.tone}>{d.label}</Badge>;
}

const TONES: Record<string, 'neutral' | 'info' | 'positive' | 'warning' | 'danger'> = {
  VERIFIED: 'positive',
  ACCEPTED: 'positive',
  ACTIVE: 'positive',
  PAID: 'positive',
  PROCESSED: 'positive',
  CAPTURED: 'positive',
  RESOLVED: 'positive',
  APPROVED: 'positive',
  PENDING_REVIEW: 'warning',
  PENDING: 'warning',
  READY_FOR_PAYOUT: 'warning',
  PROCESSING: 'warning',
  OPEN: 'warning',
  UNDER_REVIEW: 'warning',
  IN_PROGRESS: 'info',
  AWAITING_USER: 'info',
  CREATED: 'neutral',
  INVESTIGATING: 'info',
  ESCALATED: 'danger',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  FAILED: 'danger',
  CHANGES_REQUESTED: 'warning',
  HIGH: 'danger',
  CRITICAL: 'danger',
  MEDIUM: 'warning',
  LOW: 'neutral',
  DRAFT: 'neutral',
  NOT_STARTED: 'neutral',
  REFUNDED: 'neutral',
  PARTIALLY_REFUNDED: 'info',
  CLOSED: 'neutral',
  ELIGIBLE: 'positive',
  IN_PAYOUT: 'warning',
  PAID_OUT: 'positive',
  VOID: 'neutral',
};
export const StatusBadge = ({ status }: { status: string }) => (
  <Badge tone={TONES[status] ?? 'neutral'}>{label(status)}</Badge>
);

export function VerificationBadge({
  verified,
  label: l = 'Verified',
}: {
  verified: boolean;
  label?: string;
}) {
  return verified ? (
    <Badge tone="positive">
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> {l}
    </Badge>
  ) : (
    <Badge tone="warning">
      <ShieldAlert className="h-3.5 w-3.5" aria-hidden /> Not verified
    </Badge>
  );
}

export const ConnectorBadge = ({ type, kw }: { type: ConnectorType; kw?: number }) => (
  <Badge tone="info">
    {CONNECTOR_LABELS[type]}
    {kw ? ` · ${kw} kW` : ''}
  </Badge>
);
export const SampleBadge = () => <Badge tone="demo">SAMPLE</Badge>;
export const DemoPaymentBadge = () => <Badge tone="demo">DEMO PAYMENT</Badge>;

export function PriceBreakdown({
  items,
  total,
  isEstimate,
}: {
  items: LineItem[];
  total: number;
  isEstimate?: boolean;
}) {
  return (
    <dl className="space-y-2 text-sm">
      {items.map((i) => (
        <div key={i.code} className="flex justify-between">
          <dt className="text-slate-strong">{i.label}</dt>
          <dd>
            <Money minor={i.amountMinor} />
          </dd>
        </div>
      ))}
      <div className="flex justify-between border-t border-line pt-2 font-semibold">
        <dt>{isEstimate ? 'Total (estimate, prepaid)' : 'Total'}</dt>
        <dd>
          <Money minor={total} />
        </dd>
      </div>
    </dl>
  );
}

/** Confirmation with a mandatory reason (admin actions are audit-logged with it). */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  danger,
  onConfirm,
  extra,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  danger?: boolean;
  extra?: ReactNode;
  onConfirm: (reason: string) => Promise<unknown>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setReason('');
          setErr(null);
        }
      }}
    >
      <DialogContent title={title} description={description}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setErr(null);
            try {
              await onConfirm(reason.trim());
              onOpenChange(false);
              setReason('');
            } catch (x) {
              setErr(errorMessage(x));
            } finally {
              setBusy(false);
            }
          }}
        >
          {extra}
          <Field
            label="Reason (recorded in the audit log)"
            htmlFor="reason"
            error={err ?? undefined}
          >
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={5}
              required
              placeholder="At least 5 characters"
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant={danger ? 'danger' : 'primary'}
              loading={busy}
              disabled={reason.trim().length < 5}
            >
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function formatDate(iso: string | null | undefined, withTime = true): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(iso));
}
