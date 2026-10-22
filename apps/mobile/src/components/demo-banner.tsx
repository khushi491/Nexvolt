import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Banner } from './ui';

/** Persistent notice when the backend runs in local demo mode. */
export function DemoBanner() {
  const { data } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.health(),
    staleTime: 60_000,
  });
  if (!data?.demoMode) return null;
  return (
    <Banner tone="demo" icon="flask-outline">
      Demo mode: payments are simulated (DEMO PAYMENT) and SAMPLE listings are fictional.
    </Banner>
  );
}
