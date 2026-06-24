import { Task, WorkerMessage, WorkerInput } from '../types/index';

class TaskManager {
  private tasks: Map<string, Task> = new Map();
  private workers: Map<string, Worker> = new Map();
  private listeners: Set<(task: Task) => void> = new Set();
  private modelUrl: string = import.meta.env.BASE_URL + 'model/model.json';

  createTask(file: File): string {
    const id = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    console.log('[TaskManager] Creating task:', id);
    console.log('[TaskManager] File:', file.name, file.type, file.size);
    
    const originalImage = URL.createObjectURL(file);
    
    const task: Task = {
      id,
      status: 'pending',
      progress: 0,
      fileName: file.name,
      fileSize: file.size,
      originalImage,
      createdAt: new Date()
    };

    this.tasks.set(id, task);
    this.notifyListeners(task);
    this.processTask(id, file);
    
    return id;
  }

  private async processTask(taskId: string, file: File) {
    console.log('[TaskManager] processTask called for:', taskId);
    
    try {
      console.log('[TaskManager] Creating worker...');
      const worker = new Worker(
        new URL('../workers/imageProcessor.worker.ts', import.meta.url),
        { type: 'module' }
      );
      console.log('[TaskManager] Worker created');

      this.workers.set(taskId, worker);

      worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
        console.log('[TaskManager] Message from worker:', event.data);
        const data = event.data;
        const task = this.tasks.get(taskId);
        
        if (!task) return;

        if (data.type === 'progress') {
          task.status = data.status as any;
          task.progress = data.progress || 0;
          this.notifyListeners(task);
        } else if (data.type === 'complete') {
          task.status = 'complete';
          task.progress = 100;
          task.enhancedImage = data.result;
          this.notifyListeners(task);
          this.workers.delete(taskId);
          worker.terminate();
        } else if (data.type === 'error') {
          task.status = 'error';
          task.error = data.error;
          this.notifyListeners(task);
          this.workers.delete(taskId);
          worker.terminate();
        }
      };

      worker.onerror = (error) => {
        console.error('[TaskManager] Worker error:', error);
        const task = this.tasks.get(taskId);
        if (task) {
          task.status = 'error';
          task.error = error.message;
          this.notifyListeners(task);
        }
        this.workers.delete(taskId);
        worker.terminate();
      };

      const input: WorkerInput = {
        taskId,
        file,
        modelUrl: this.modelUrl
      };
      
      console.log('[TaskManager] Sending data to worker:', input.taskId);
      console.log('[TaskManager] file.name:', file.name);
      console.log('[TaskManager] file.type:', file.type);
      console.log('[TaskManager] file.size:', file.size);
      console.log('[TaskManager] modelUrl:', this.modelUrl);
      
      worker.postMessage(input);
      console.log('[TaskManager] Data sent to worker');

    } catch (error) {
      console.error('[TaskManager] Error in processTask:', error);
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = 'error';
        task.error = error instanceof Error ? error.message : 'Unknown error';
        this.notifyListeners(task);
      }
    }
  }

  cancelTask(taskId: string): boolean {
    const worker = this.workers.get(taskId);
    if (worker) {
      worker.postMessage({ type: 'cancel', taskId });
      setTimeout(() => {
        worker.terminate();
        this.workers.delete(taskId);
      }, 100);
      
      const task = this.tasks.get(taskId);
      if (task) {
        task.status = 'cancelled';
        this.notifyListeners(task);
      }
      return true;
    }
    return false;
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  subscribe(listener: (task: Task) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(task: Task) {
    this.listeners.forEach(listener => listener(task));
  }
}

export const taskManager = new TaskManager();