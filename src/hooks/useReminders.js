import { useState, useEffect, useCallback } from 'react';
import { getReminders, createReminder, updateReminder, deleteReminder } from '../lib/db';

/**
 * Hook for managing reminders with real Supabase data.
 */
export function useReminders() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchReminders = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getReminders();
    if (error) {
      setError(error.message);
    } else {
      setReminders(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchReminders(); }, [fetchReminders]);

  const addReminder = async (reminderData) => {
    const { data, error } = await createReminder(reminderData);
    if (error) return { error };
    setReminders(prev => [data, ...prev]);
    return { data };
  };

  const snoozeReminder = async (id, minutes = 30) => {
    const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const { data, error } = await updateReminder(id, {
      status: 'snoozed',
      snooze_until: snoozeUntil,
    });
    if (error) return { error };
    setReminders(prev => prev.map(r => r.id === id ? data : r));
    return { data };
  };

  const markDelivered = async (id) => {
    const { data, error } = await updateReminder(id, { status: 'delivered' });
    if (error) return { error };
    setReminders(prev => prev.map(r => r.id === id ? data : r));
    return { data };
  };

  const dismissReminder = async (id) => {
    const { error } = await deleteReminder(id);
    if (error) return { error };
    setReminders(prev => prev.filter(r => r.id !== id));
    return {};
  };

  return {
    reminders, loading, error,
    refetch: fetchReminders,
    addReminder, snoozeReminder, markDelivered, dismissReminder,
  };
}
