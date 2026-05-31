/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 브라우저용 Supabase 클라이언트 (클라이언트 컴포넌트에서 인증/이벤트 처리)
// 주의: AI Studio 환경 구조상 Next.js 서버 컴포넌트(SSR) 대신 React/Vite 환경에서 구동됩니다.
export const createBrowserClient = () => {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('Supabase 환경 변수가 설정되지 않았습니다.');
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
};
