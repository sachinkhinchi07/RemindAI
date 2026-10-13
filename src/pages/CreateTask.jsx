import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import CreateTaskModal from '../components/CreateTaskModal';
import MyTasksV2 from './MyTasksV2';
import { createTask } from '../lib/db';

export default function CreateTask() {
  const navigate = useNavigate();

  const handleSave = async (data) => {
    let safeDueDate = null;
    if (data.due) {
      const parsed = new Date(data.due);
      if (!isNaN(parsed.getTime())) {
        safeDueDate = parsed.toISOString();
      }
    }

    await createTask({
      title: data.title || 'New Scheduled Task',
      tags: ['#ai-extracted'],
      due_at: safeDueDate,
      priority: 'high',
      status: 'queued',
      risk_score: 20,
      risk_label: 'Low Slip Risk (20%)',
      risk_reason: 'Proactive reminder scheduled',
    });

    navigate('/tasks');
  };

  return (
    <div style={{ position: 'relative', minHeight: '100%' }}>
      {/* Background preview of tasks */}
      <div style={{ filter: 'blur(3px)', opacity: 0.6, pointerEvents: 'none' }}>
        <MyTasksV2 />
      </div>
      {/* Create Task Drawer / Modal */}
      <CreateTaskModal
        isOpen={true}
        onClose={() => navigate('/tasks')}
        onSave={handleSave}
      />
    </div>
  );
}

