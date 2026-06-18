import type { Session, User as SupabaseAuthUser } from '@supabase/supabase-js';
import { User } from '../types';
import { supabase, isSupabaseConfigured } from './supabase';

export interface LoginResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

const VALID_ROLES: User['role'][] = ['admin', 'manager', 'viewer'];

function getRole(value: unknown): User['role'] {
  return VALID_ROLES.includes(value as User['role']) ? value as User['role'] : 'admin';
}

function getDisplayName(user: SupabaseAuthUser): string {
  const metadata = user.user_metadata || {};
  const name = metadata.name || metadata.full_name || metadata.display_name;
  if (typeof name === 'string' && name.trim()) return name.trim();
  if (user.email) return user.email.split('@')[0];
  return 'Usuario';
}

function toAppUser(user: SupabaseAuthUser): User {
  return {
    id: user.id,
    email: user.email || '',
    name: getDisplayName(user),
    role: getRole(user.user_metadata?.role),
    avatar: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : undefined,
    createdAt: user.created_at || new Date().toISOString(),
  };
}

function sessionToLoginResult(session: Session | null): LoginResult {
  if (!session?.user || !session.access_token) {
    return { success: false, error: 'Sessao invalida. Faca login novamente.' };
  }

  return {
    success: true,
    user: toAppUser(session.user),
    token: session.access_token,
  };
}

export function initializeAuth(): void {
  // Supabase Auth initializes its persisted browser session through the Supabase client.
}

export async function login(email: string, password: string): Promise<LoginResult> {
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Supabase nao configurado para autenticacao.' };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) {
    return { success: false, error: 'Email ou senha invalidos.' };
  }

  return sessionToLoginResult(data.session);
}

export async function logout(): Promise<void> {
  if (!isSupabaseConfigured || !supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) console.error('[SUPABASE SIGN OUT ERROR]', error);
}

export async function getSession(): Promise<{ user: User | null; token: string | null }> {
  if (!isSupabaseConfigured || !supabase) return { user: null, token: null };

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user || !data.session.access_token) {
    return { user: null, token: null };
  }

  return {
    user: toAppUser(data.session.user),
    token: data.session.access_token,
  };
}

export async function isAuthenticated(): Promise<boolean> {
  const { user } = await getSession();
  return !!user;
}