'use client';
import { useQuery } from '@tanstack/react-query';
import { EmptyState, ErrorState, PageHeader } from '@/components/common';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { api } from '@/lib/api';

// Rough India bounding box for a privacy-safe schematic (no basemap, no exact points).
const BOUNDS = { minLat: 6, maxLat: 37.5, minLng: 68, maxLng: 97.5 };

export default function GeoPage() {
  const q = useQuery({ queryKey: ['admin-geo'], queryFn: () => api.admin.geo() });
  if (q.isLoading) return <SkeletonRows rows={4} />;
  if (q.isError) return <ErrorState error={q.error} />;
  const rows = q.data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.chargers));
  return (
    <>
      <PageHeader
        title="Geographic overview"
        description="City-level aggregates of APPROXIMATE public locations only. No exact charger addresses are shown here. A basemap requires a Google Maps key (not configured)."
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState title="No chargers yet" />
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Schematic</CardTitle>
            </CardHeader>
            <CardContent>
              <svg
                viewBox="0 0 300 320"
                className="w-full rounded-md bg-background"
                role="img"
                aria-label="Schematic map of charger clusters by city"
              >
                {rows.map((r) => {
                  const x =
                    ((r.center.lng - BOUNDS.minLng) / (BOUNDS.maxLng - BOUNDS.minLng)) * 280 + 10;
                  const y =
                    (1 - (r.center.lat - BOUNDS.minLat) / (BOUNDS.maxLat - BOUNDS.minLat)) * 300 +
                    10;
                  const rad = 6 + (r.chargers / max) * 18;
                  return (
                    <g key={`${r.city}-${r.state}`}>
                      <circle
                        cx={x}
                        cy={y}
                        r={rad}
                        fill="#12B8A6"
                        fillOpacity={0.35}
                        stroke="#0B7A6E"
                      />
                      <text x={x + rad + 4} y={y + 4} fontSize="10" fill="#101F35">
                        {r.city} ({r.chargers})
                      </text>
                    </g>
                  );
                })}
              </svg>
            </CardContent>
          </Card>
          <Card>
            <Table>
              <THead>
                <TR>
                  <TH>City</TH>
                  <TH>Chargers</TH>
                  <TH>Verified</TH>
                  <TH>Bookings (30d)</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={`${r.city}-${r.state}`}>
                    <TD>
                      {r.city}
                      <div className="text-xs text-slate-strong">{r.state}</div>
                    </TD>
                    <TD>{r.chargers}</TD>
                    <TD>{r.verified}</TD>
                    <TD>{r.bookings30d}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Card>
        </div>
      )}
    </>
  );
}
