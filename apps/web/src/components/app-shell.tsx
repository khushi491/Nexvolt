'use client';
import type { Role } from '@nexvolt/shared';
import {
  BadgeCheck,
  BarChart3,
  BatteryCharging,
  CalendarDays,
  ClipboardList,
  CreditCard,
  FileClock,
  Gavel,
  Home,
  LifeBuoy,
  LogOut,
  Map,
  Menu,
  Settings,
  ShieldAlert,
  User,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useSession } from '@/lib/session';
import { cn } from '@/lib/utils';
import { Logo } from './brand';
import { DemoBanner } from './demo-banner';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
}

const ICON = 'h-4 w-4';
const HOST_NAV: NavItem[] = [
  { href: '/host', label: 'Dashboard', icon: <Home className={ICON} />, roles: ['HOST'] },
  {
    href: '/host/chargers',
    label: 'Chargers',
    icon: <BatteryCharging className={ICON} />,
    roles: ['HOST'],
  },
  {
    href: '/host/calendar',
    label: 'Calendar',
    icon: <CalendarDays className={ICON} />,
    roles: ['HOST'],
  },
  {
    href: '/host/bookings',
    label: 'Bookings',
    icon: <ClipboardList className={ICON} />,
    roles: ['HOST'],
  },
  { href: '/host/earnings', label: 'Earnings', icon: <Wallet className={ICON} />, roles: ['HOST'] },
  { href: '/host/profile', label: 'Profile', icon: <User className={ICON} />, roles: ['HOST'] },
];
const ADMIN_NAV: NavItem[] = [
  {
    href: '/admin',
    label: 'Overview',
    icon: <BarChart3 className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/verification',
    label: 'Verification',
    icon: <BadgeCheck className={ICON} />,
    roles: ['ADMIN'],
  },
  {
    href: '/admin/chargers',
    label: 'Chargers',
    icon: <BatteryCharging className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/users',
    label: 'Users & hosts',
    icon: <Users className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/bookings',
    label: 'Bookings',
    icon: <ClipboardList className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/payments',
    label: 'Payments & refunds',
    icon: <CreditCard className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/disputes',
    label: 'Disputes',
    icon: <Gavel className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  { href: '/admin/payouts', label: 'Payouts', icon: <Wallet className={ICON} />, roles: ['ADMIN'] },
  {
    href: '/admin/support',
    label: 'Support',
    icon: <LifeBuoy className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/incidents',
    label: 'Safety incidents',
    icon: <ShieldAlert className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/map',
    label: 'Geo overview',
    icon: <Map className={ICON} />,
    roles: ['ADMIN', 'SUPPORT'],
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: <Settings className={ICON} />,
    roles: ['ADMIN'],
  },
  {
    href: '/admin/audit',
    label: 'Audit log',
    icon: <FileClock className={ICON} />,
    roles: ['ADMIN'],
  },
];

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const path = usePathname();
  return (
    <ul className="space-y-1">
      {items.map((i) => {
        const active =
          i.href === '/host' || i.href === '/admin' ? path === i.href : path.startsWith(i.href);
        return (
          <li key={i.href}>
            <Link
              href={i.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-[40px] items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/75 hover:bg-white/5 hover:text-white',
              )}
            >
              {i.icon}
              {i.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { user, hasRole, logout } = useSession();
  const host = HOST_NAV.filter((i) => i.roles.some((r) => hasRole(r)));
  const admin = ADMIN_NAV.filter((i) => i.roles.some((r) => hasRole(r)));
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto bg-navy px-3 py-5">
      <div className="px-3">
        <Logo inverse />
      </div>
      {host.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">
            Host
          </p>
          <NavLinks items={host} onNavigate={onNavigate} />
        </div>
      )}
      {!hasRole('HOST') && (
        <Link
          href="/onboarding"
          onClick={onNavigate}
          className="mx-3 rounded-md border border-white/20 px-3 py-2 text-sm text-white/90 hover:bg-white/5"
        >
          Become a host →
        </Link>
      )}
      {admin.length > 0 && (
        <div>
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/50">
            Operations
          </p>
          <NavLinks items={admin} onNavigate={onNavigate} />
        </div>
      )}
      <div className="mt-auto border-t border-white/10 px-3 pt-4">
        <p className="truncate text-sm font-semibold text-white">{user?.name ?? 'Nexvolt user'}</p>
        <p className="text-xs text-white/60">{user?.roles.join(' · ')}</p>
        <button
          onClick={() => void logout()}
          className="mt-3 inline-flex min-h-[40px] items-center gap-2 rounded-md px-2 text-sm text-white/80 hover:bg-white/5 hover:text-white"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen">
      <DemoBanner />
      <div className="flex">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 lg:block">
          <Sidebar />
        </aside>
        {open && (
          <div
            className="fixed inset-0 z-40 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
          >
            <div className="absolute inset-0 bg-navy/50" onClick={() => setOpen(false)} />
            <div className="absolute inset-y-0 left-0 w-72">
              <Sidebar onNavigate={() => setOpen(false)} />
            </div>
            <button
              className="absolute right-4 top-4 rounded-md bg-white p-2"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur lg:hidden">
            <button
              onClick={() => setOpen(true)}
              className="rounded-md p-2 hover:bg-background"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Logo />
          </header>
          <main id="main" className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
