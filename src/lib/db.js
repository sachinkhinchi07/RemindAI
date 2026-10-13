import { supabase } from '../lib/supabase';

// ─── TASKS ────────────────────────────────────────────────────────────────────

/** Fetch all tasks for the logged-in user */
export async function getTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('created_at', { ascending: false });
  return { data, error };
}

/** Create a new task */
export async function createTask(taskData) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    console.error('No logged-in user found when creating task!');
    return { error: { message: 'You must be logged in to create a task.' } };
  }
  const { data, error } = await supabase
    .from('tasks')
    .insert({ ...taskData, user_id: user.id })
    .select()
    .single();
  return { data, error };
}

/** Update an existing task by id */
export async function updateTask(id, updates) {
  const { data, error } = await supabase
    .from('tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

/** Delete a task by id */
export async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', id);
  return { error };
}

/** Mark a task as done */
export async function completeTask(id) {
  return updateTask(id, { status: 'done', completed_at: new Date().toISOString() });
}

// ─── REMINDERS ────────────────────────────────────────────────────────────────

/** Fetch all reminders for the logged-in user */
export async function getReminders() {
  const { data, error } = await supabase
    .from('reminders')
    .select('*, tasks(title)')
    .order('remind_at', { ascending: true });
  return { data, error };
}

/** Create a reminder */
export async function createReminder(reminderData) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('reminders')
    .insert({ ...reminderData, user_id: user.id })
    .select()
    .single();
  return { data, error };
}

/** Update a reminder (e.g. snooze, mark delivered) */
export async function updateReminder(id, updates) {
  const { data, error } = await supabase
    .from('reminders')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  return { data, error };
}

/** Delete a reminder */
export async function deleteReminder(id) {
  const { error } = await supabase
    .from('reminders')
    .delete()
    .eq('id', id);
  return { error };
}

// ─── USER PROFILE ─────────────────────────────────────────────────────────────

/** Get the profile for the logged-in user */
export async function getProfile() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  return { data, error };
}

/** Update the profile */
export async function updateProfile(updates) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id)
    .select()
    .single();
  return { data, error };
}

// ─── USER SETTINGS ────────────────────────────────────────────────────────────

/** Get user settings, or create defaults if they don't exist */
export async function getUserSettings() {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // Create default settings if not found
  if (error?.code === 'PGRST116') {
    const { data: newSettings, error: createError } = await supabase
      .from('user_settings')
      .insert({ user_id: user.id })
      .select()
      .single();
    return { data: newSettings, error: createError };
  }

  return { data, error };
}

/** Save user settings */
export async function saveUserSettings(settings) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ ...settings, user_id: user.id })
    .select()
    .single();
  return { data, error };
}
