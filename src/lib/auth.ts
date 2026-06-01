// Simple but real authentication system using localStorage + JWT-like tokens
import { User } from '../types';

const USERS_KEY = 'stck_users';
const TOKEN_KEY = 'stck_token';
const SESSION_KEY = 'stck_session';

// Simple hash function (production would use bcrypt via API)
function simpleHash(str: string): string {
  let hash = 0;
  const salt = 'STCK_SALT_2024_SECURE';
  const salted = str + salt;
  for (let i = 0; i < salted.length; i++) {
    const char = salted.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + salted.length.toString(36);
}

// JWT-like token creation
function createToken(payload: object): string {
  const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = btoa(JSON.stringify({ ...payload, iat: Date.now(), exp: Date.now() + 24 * 60 * 60 * 1000 }));
  const secret = 'STCK_JWT_SECRET_2024';
  const signature = btoa(simpleHash(header + '.' + body + secret));
  return `${header}.${body}.${signature}`;
}

function verifyToken(token: string): { valid: boolean; payload?: Record<string, unknown> } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false };
    const payload = JSON.parse(atob(parts[1])) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && payload.exp < Date.now()) return { valid: false };
    return { valid: true, payload };
  } catch {
    return { valid: false };
  }
}

interface StoredUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'manager' | 'viewer';
  passwordHash: string;
  createdAt: string;
}

function getStoredUsers(): StoredUser[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveStoredUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function initializeAuth(): void {
  const users = getStoredUsers();
  const adminExists = users.find(u => u.email === 'admin@admin.com');
  if (!adminExists) {
    const adminUser: StoredUser = {
      id: 'user_admin_001',
      email: 'admin@admin.com',
      name: 'Administrador',
      role: 'admin',
      passwordHash: simpleHash('Admin123@'),
      createdAt: new Date().toISOString(),
    };
    users.push(adminUser);
    saveStoredUsers(users);
  }
}

export interface LoginResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

export function login(email: string, password: string): LoginResult {
  const users = getStoredUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return { success: false, error: 'Email ou senha inválidos.' };
  }
  const hash = simpleHash(password);
  if (hash !== user.passwordHash) {
    return { success: false, error: 'Email ou senha inválidos.' };
  }
  const publicUser: User = {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt,
  };
  const token = createToken({ userId: user.id, email: user.email, role: user.role });
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(SESSION_KEY, JSON.stringify(publicUser));
  return { success: true, user: publicUser, token };
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(SESSION_KEY);
}

export function getSession(): { user: User | null; token: string | null } {
  const token = localStorage.getItem(TOKEN_KEY);
  const sessionRaw = localStorage.getItem(SESSION_KEY);
  if (!token || !sessionRaw) return { user: null, token: null };
  const { valid } = verifyToken(token);
  if (!valid) {
    logout();
    return { user: null, token: null };
  }
  try {
    const user = JSON.parse(sessionRaw) as User;
    return { user, token };
  } catch {
    return { user: null, token: null };
  }
}

export function isAuthenticated(): boolean {
  const { user } = getSession();
  return !!user;
}
