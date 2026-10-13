import { useState, useEffect, useCallback } from 'react';
import { getProfile, updateProfile, getUserSettings, saveUserSettings } from '../lib/db';

/**
 * Hook for the logged-in user's profile.
 */
export function useProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getProfile();
    if (error) setError(error.message);
    else setProfile(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const saveProfile = async (updates) => {
    const { data, error } = await updateProfile(updates);
    if (error) return { error };
    setProfile(data);
    return { data };
  };

  return { profile, loading, error, saveProfile, refetch: fetchProfile };
}

/**
 * Hook for user notification settings / preferences.
 */
export function useSettings() {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getUserSettings();
    if (error) setError(error.message);
    else setSettings(data);
    setLoading(false);
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  const saveSettings = async (updates) => {
    setSaving(true);
    const { data, error } = await saveUserSettings(updates);
    setSaving(false);
    if (error) return { error };
    setSettings(data);
    return { data };
  };

  return { settings, loading, saving, error, saveSettings, refetch: fetchSettings };
}
