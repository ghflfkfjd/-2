import { createClient } from '@supabase/supabase-js';

// 서버용 Supabase 클라이언트 (Express API / 서버 액션에서 안전하게 사용)
// 서버에서는 세션 영속성(persistSession)을 비활성화하여 메모리 누수를 방지합니다.
export const createServerClient = (supabaseUrl: string, supabaseServiceKey: string) => {
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false
    }
  });
};
