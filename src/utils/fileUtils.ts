import fs from 'fs-extra';
import path from 'path';
import crypto from 'crypto';
import { logger } from './logger';

export class FileUtils {
  static async ensureDir(dirPath: string): Promise<void> {
    try {
      await fs.ensureDir(dirPath);
    } catch (error) {
      logger.error(`Failed to create directory: ${dirPath}`, error);
      throw error;
    }
  }

  static async writeJSON(filePath: string, data: any): Promise<void> {
    try {
      await fs.writeJson(filePath, data, { spaces: 2 });
    } catch (error) {
      logger.error(`Failed to write JSON file: ${filePath}`, error);
      throw error;
    }
  }

  static async readJSON<T>(filePath: string): Promise<T | null> {
    try {
      if (await fs.pathExists(filePath)) {
        return await fs.readJson(filePath);
      }
      return null;
    } catch (error) {
      logger.error(`Failed to read JSON file: ${filePath}`, error);
      return null;
    }
  }

  static async copyFile(src: string, dest: string): Promise<void> {
    try {
      await fs.copy(src, dest);
    } catch (error) {
      logger.error(`Failed to copy file from ${src} to ${dest}`, error);
      throw error;
    }
  }

  static async deleteFile(filePath: string): Promise<void> {
    try {
      if (await fs.pathExists(filePath)) {
        await fs.remove(filePath);
      }
    } catch (error) {
      logger.error(`Failed to delete file: ${filePath}`, error);
      throw error;
    }
  }

  static async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch (error) {
      logger.error(`Failed to get file size: ${filePath}`, error);
      return 0;
    }
  }

  static async getFileHash(filePath: string): Promise<string> {
    try {
      const data = await fs.readFile(filePath);
      return crypto.createHash('sha256').update(data).digest('hex');
    } catch (error) {
      logger.error(`Failed to get file hash: ${filePath}`, error);
      return '';
    }
  }

  static async listFiles(dirPath: string, extension?: string): Promise<string[]> {
    try {
      if (!(await fs.pathExists(dirPath))) {
        return [];
      }

      const files = await fs.readdir(dirPath);
      if (extension) {
        return files.filter(file => path.extname(file).toLowerCase() === extension.toLowerCase());
      }
      return files;
    } catch (error) {
      logger.error(`Failed to list files in directory: ${dirPath}`, error);
      return [];
    }
  }

  static async listDirectories(dirPath: string): Promise<string[]> {
    try {
      if (!(await fs.pathExists(dirPath))) {
        return [];
      }

      const items = await fs.readdir(dirPath);
      const directories: string[] = [];

      for (const item of items) {
        const itemPath = path.join(dirPath, item);
        const stat = await fs.stat(itemPath);
        if (stat.isDirectory()) {
          directories.push(item);
        }
      }

      return directories;
    } catch (error) {
      logger.error(`Failed to list directories in: ${dirPath}`, error);
      return [];
    }
  }

  static sanitizeFilename(filename: string): string {
    return filename
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/_{2,}/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 100);
  }

  static generateUniqueId(): string {
    return crypto.randomUUID();
  }

  static async createTempDir(): Promise<string> {
    const tempDir = path.join(process.cwd(), 'temp', FileUtils.generateUniqueId());
    await FileUtils.ensureDir(tempDir);
    return tempDir;
  }

  static async cleanupTempDir(tempDir: string): Promise<void> {
    try {
      await fs.remove(tempDir);
    } catch (error) {
      logger.warn(`Failed to cleanup temp directory: ${tempDir}`, error);
    }
  }
}