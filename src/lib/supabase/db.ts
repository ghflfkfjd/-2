import { createBrowserClient } from './client';

export const createChatSession = async (userId: string, characterId: string, userPersona: string): Promise<string> => {
  const supabase = createBrowserClient();
  if (!supabase) {
    console.warn('Supabase not configured. Using local fallback session ID.');
    return `local-session-${Date.now()}`;
  }
  
  try {
    const { data, error } = await supabase
      .from('chats')
      .insert([{
        user_id: userId,
        character_id: characterId,
        user_persona_in_chat: userPersona
      }])
      .select()
      .single();
      
    if (error) {
       console.error('Error creating chat session in Supabase:', error);
       return `local-session-${Date.now()}`;
    }
    
    return data.id;
  } catch (err) {
    console.error('Error creating chat session:', err);
    return `local-session-${Date.now()}`;
  }
};
