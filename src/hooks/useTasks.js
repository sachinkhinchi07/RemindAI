import { useState, useEffect, useCallback } from 'react';
import { getTasks, createTask, updateTask, deleteTask, completeTask } from '../lib/db';

/**
 * Hook for managing tasks with real-time Supabase data.
 * Provides tasks array, loading/error state, and CRUD methods.
 */
export function useTasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await getTasks();
    if (error) {
      setError(error.message);
    } else {
      setTasks(data || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const addTask = async (taskData) => {
    const { data, error } = await createTask(taskData);
    if (error) return { error };
    setTasks(prev => [data, ...prev]);
    return { data };
  };

  const editTask = async (id, updates) => {
    const { data, error } = await updateTask(id, updates);
    if (error) return { error };
    setTasks(prev => prev.map(t => t.id === id ? data : t));
    return { data };
  };

  const removeTask = async (id) => {
    const { error } = await deleteTask(id);
    if (error) return { error };
    setTasks(prev => prev.filter(t => t.id !== id));
    return {};
  };

  const markDone = async (id) => {
    const { data, error } = await completeTask(id);
    if (error) return { error };
    setTasks(prev => prev.map(t => t.id === id ? data : t));
    return { data };
  };

  const toggleStar = async (id) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    return editTask(id, { starred: !task.starred });
  };

  return { tasks, loading, error, refetch: fetchTasks, addTask, editTask, removeTask, markDone, toggleStar };
}
