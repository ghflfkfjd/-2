import { createBrowserClient } from './client';

export const signInAsGuest = async () => {
  const supabase = createBrowserClient();
  if (!supabase) {
    console.warn('Supabase URL/Key config missing. Cannot sign in as guest.');
    return null;
  }
  
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return session.user;
    }
    
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      if (error.message.includes('Anonymous sign-ins are disabled')) {
        console.warn('⚠️ Supabase Anonymous Auth is disabled. Please enable it in your Supabase Dashboard (Authentication > Providers > Email > Allow Anonymous Sign-ins). Falling back to local mock user.');
        return { id: 'mock-local-user-id' } as any;
      }
      throw error;
    }
    
    // Create profile if necessary based on your RLS/triggers
    if (data.user) {
       // Insert into profiles if it doesn't auto-create with a trigger
       const { error: profileError } = await supabase.from('profiles').upsert({
           id: data.user.id,
           display_name: 'Guest Player'
       }, { onConflict: 'id' });
       
       if (profileError) {
         console.warn("Failed to create profile record:", profileError);
       }
    }
    
    return data.user;
  } catch (error) {
    console.error('Supabase Auth error:', error);
    return null;
  }
};
