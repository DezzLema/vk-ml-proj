import React, { useState, useEffect } from 'react';
import { ImageUploader } from './components/ImageUploader';
import { taskManager } from './services/taskManager';
import { Task } from './types/index';
import './App.css';

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = taskManager.subscribe((task) => {
      setTasks(prev => {
        const index = prev.findIndex(t => t.id === task.id);
        if (index >= 0) {
          const newTasks = [...prev];
          newTasks[index] = task;
          return newTasks;
        }
        return [task, ...prev];
      });
    });

    return unsubscribe;
  }, []);

  const handleTaskCreated = (taskId: string) => {
    setSelectedTaskId(taskId);
  };

  const handleCancelTask = (taskId: string) => {
    taskManager.cancelTask(taskId);
  };

  const selectedTask = selectedTaskId ? taskManager.getTask(selectedTaskId) : null;

  const getStatusText = (status: string) => {
    const statusMap: Record<string, string> = {
      'pending': 'Pending',
      'decoding': 'Decoding',
      'decoding_heic': 'Converting HEIC',
      'loading_model': 'Loading model',
      'preprocessing': 'Preprocessing',
      'inference': 'Analyzing',
      'applying_filters': 'Applying corrections',
      'encoding': 'Encoding',
      'complete': 'Complete',
      'error': 'Error',
      'cancelled': 'Cancelled'
    };
    return statusMap[status] || status;
  };

  const getStatusClass = (status: string) => {
    if (status === 'complete') return 'complete';
    if (status === 'error') return 'error';
    if (status === 'cancelled') return 'cancelled';
    return '';
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Image Enhancement</h1>
        <p>Automatic correction of brightness, contrast, and saturation</p>
      </header>

      <ImageUploader onTaskCreated={handleTaskCreated} />

      <section className="tasks-section">
        <div className="section-header">
          <h2>Tasks</h2>
          {tasks.length > 0 && <span className="count">{tasks.length}</span>}
        </div>

        {tasks.length === 0 && (
          <div className="empty-state">
            <p>No tasks yet. Upload an image to begin.</p>
          </div>
        )}

        {tasks.map(task => (
          <div
            key={task.id}
            className={`task-item ${selectedTaskId === task.id ? 'selected' : ''}`}
            onClick={() => setSelectedTaskId(task.id)}
          >
            <div className="thumbnail">
              {task.originalImage ? (
                <img src={task.originalImage} alt={task.fileName} />
              ) : (
                <div className="thumbnail-placeholder">—</div>
              )}
            </div>

            <div className="task-info">
              <div className="name">{task.fileName}</div>
              <div className="meta">
                <span className={`status ${getStatusClass(task.status)}`}>
                  {getStatusText(task.status)}
                </span>
                <span className="progress-text">{task.progress}%</span>
                <span className="progress-bar">
                  <span className="fill" style={{ width: `${task.progress}%` }} />
                </span>
                <span className="progress-text">{formatFileSize(task.fileSize)}</span>
              </div>
            </div>

            <div className="task-actions">
              {task.status !== 'complete' && task.status !== 'error' && task.status !== 'cancelled' && (
                <button
                  className="btn-cancel"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelTask(task.id);
                  }}
                >
                  Cancel
                </button>
              )}
              {task.status === 'complete' && task.enhancedImage && (
                <a
                  href={task.enhancedImage}
                  download={`enhanced_${task.fileName}`}
                  className="btn-download"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download
                </a>
              )}
            </div>
          </div>
        ))}
      </section>

      {selectedTask && (
        <section className="preview-section">
          <div className="header">
            <h2>Preview</h2>
            <span className="filename">{selectedTask.fileName}</span>
          </div>

          <div className="preview-grid">
            <div className="preview-item">
              <div className="label">
                Original
                {selectedTask.originalImage && (
                  <span className="badge">
                    {formatFileSize(selectedTask.fileSize)}
                  </span>
                )}
              </div>
              <div className="image-wrapper">
                {selectedTask.originalImage ? (
                  <img src={selectedTask.originalImage} alt="Original" />
                ) : (
                  <span className="placeholder">No image</span>
                )}
              </div>
            </div>

            <div className="preview-item">
              <div className="label">
                Enhanced
                {selectedTask.enhancedImage && (
                  <span className="badge">Ready</span>
                )}
              </div>
              <div className="image-wrapper">
                {selectedTask.enhancedImage ? (
                  <img src={selectedTask.enhancedImage} alt="Enhanced" />
                ) : selectedTask.status === 'error' ? (
                  <div className="error-overlay">
                    <p>{selectedTask.error || 'Processing failed'}</p>
                  </div>
                ) : selectedTask.status === 'cancelled' ? (
                  <div className="cancelled-overlay">
                    <p>Processing cancelled</p>
                  </div>
                ) : selectedTask.status === 'complete' ? (
                  <span className="placeholder">No result</span>
                ) : (
                  <div className="processing-overlay">
                    <div className="spinner"></div>
                    <span className="status-text">{getStatusText(selectedTask.status)}</span>
                    <div className="progress-bar-large">
                      <span className="fill" style={{ width: `${selectedTask.progress}%` }} />
                    </div>
                    <span className="progress-text">{selectedTask.progress}%</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

export default App;