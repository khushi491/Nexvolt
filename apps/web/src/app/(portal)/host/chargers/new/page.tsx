'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/common';
import { ChargerForm } from '@/components/host/charger-form';
import { useToast } from '@/components/ui/toast';
import { api, errorMessage } from '@/lib/api';

export default function NewChargerPage() {
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: api.chargers.create,
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['my-chargers'] });
      toast({ tone: 'success', message: 'Draft saved. Next: availability and documents.' });
      router.push(`/host/chargers/${c.id}?tab=availability`);
    },
    onError: (e) => toast({ tone: 'error', message: errorMessage(e) }),
  });
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Add a charger"
        description="Saved as a draft. You’ll add availability and documents next, then submit for verification."
      />
      <ChargerForm
        submitLabel="Save draft"
        busy={create.isPending}
        onSubmit={(input) => create.mutate(input)}
      />
    </div>
  );
}
