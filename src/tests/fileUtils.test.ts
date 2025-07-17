import { FileUtils } from '../utils/fileUtils';
import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

describe('FileUtils', () => {
  const testDir = path.join(process.cwd(), 'test-temp');
  
  beforeEach(async () => {
    await fs.ensureDir(testDir);
  });
  
  afterEach(async () => {
    await fs.remove(testDir);
  });

  describe('ensureDir', () => {
    it('should create directory if it does not exist', async () => {
      const dirPath = path.join(testDir, 'new-dir');
      await FileUtils.ensureDir(dirPath);
      
      const exists = await fs.pathExists(dirPath);
      expect(exists).toBe(true);
    });
    
    it('should not throw error if directory already exists', async () => {
      const dirPath = path.join(testDir, 'existing-dir');
      await fs.ensureDir(dirPath);
      
      await expect(FileUtils.ensureDir(dirPath)).resolves.not.toThrow();
    });
  });

  describe('writeJSON and readJSON', () => {
    it('should write and read JSON data correctly', async () => {
      const filePath = path.join(testDir, 'test.json');
      const testData = { name: 'Test Level', author: 'Test Author' };
      
      await FileUtils.writeJSON(filePath, testData);
      const readData = await FileUtils.readJSON(filePath);
      
      expect(readData).toEqual(testData);
    });
    
    it('should return null for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.json');
      const result = await FileUtils.readJSON(filePath);
      
      expect(result).toBeNull();
    });
  });

  describe('copyFile', () => {
    it('should copy file correctly', async () => {
      const srcPath = path.join(testDir, 'source.txt');
      const destPath = path.join(testDir, 'destination.txt');
      const content = 'Test content';
      
      await fs.writeFile(srcPath, content);
      await FileUtils.copyFile(srcPath, destPath);
      
      const destContent = await fs.readFile(destPath, 'utf8');
      expect(destContent).toBe(content);
    });
  });

  describe('getFileSize', () => {
    it('should return correct file size', async () => {
      const filePath = path.join(testDir, 'test.txt');
      const content = 'Hello World';
      
      await fs.writeFile(filePath, content);
      const size = await FileUtils.getFileSize(filePath);
      
      expect(size).toBe(Buffer.byteLength(content));
    });
    
    it('should return 0 for non-existent file', async () => {
      const filePath = path.join(testDir, 'nonexistent.txt');
      const size = await FileUtils.getFileSize(filePath);
      
      expect(size).toBe(0);
    });
  });

  describe('sanitizeFilename', () => {
    it('should remove invalid characters', () => {
      const filename = 'test<>:"/\\|?*file.dat';
      const sanitized = FileUtils.sanitizeFilename(filename);
      
      expect(sanitized).toBe('test_file.dat');
    });
    
    it('should replace multiple spaces with single underscore', () => {
      const filename = 'test   file   name.dat';
      const sanitized = FileUtils.sanitizeFilename(filename);
      
      expect(sanitized).toBe('test_file_name.dat');
    });
    
    it('should limit length to 100 characters', () => {
      const filename = 'a'.repeat(150) + '.dat';
      const sanitized = FileUtils.sanitizeFilename(filename);
      
      expect(sanitized.length).toBeLessThanOrEqual(100);
    });
  });

  describe('generateUniqueId', () => {
    it('should generate unique IDs', () => {
      const id1 = FileUtils.generateUniqueId();
      const id2 = FileUtils.generateUniqueId();
      
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('listFiles', () => {
    it('should list files in directory', async () => {
      const file1 = path.join(testDir, 'file1.txt');
      const file2 = path.join(testDir, 'file2.dat');
      const file3 = path.join(testDir, 'file3.png');
      
      await fs.writeFile(file1, 'content1');
      await fs.writeFile(file2, 'content2');
      await fs.writeFile(file3, 'content3');
      
      const allFiles = await FileUtils.listFiles(testDir);
      const datFiles = await FileUtils.listFiles(testDir, '.dat');
      
      expect(allFiles).toContain('file1.txt');
      expect(allFiles).toContain('file2.dat');
      expect(allFiles).toContain('file3.png');
      
      expect(datFiles).toContain('file2.dat');
      expect(datFiles).not.toContain('file1.txt');
    });
    
    it('should return empty array for non-existent directory', async () => {
      const files = await FileUtils.listFiles(path.join(testDir, 'nonexistent'));
      expect(files).toEqual([]);
    });
  });

  describe('listDirectories', () => {
    it('should list directories only', async () => {
      const dir1 = path.join(testDir, 'dir1');
      const dir2 = path.join(testDir, 'dir2');
      const file1 = path.join(testDir, 'file1.txt');
      
      await fs.ensureDir(dir1);
      await fs.ensureDir(dir2);
      await fs.writeFile(file1, 'content');
      
      const directories = await FileUtils.listDirectories(testDir);
      
      expect(directories).toContain('dir1');
      expect(directories).toContain('dir2');
      expect(directories).not.toContain('file1.txt');
    });
  });
});

// Mock setup for testing
const mockConsole = {
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
};

global.console = mockConsole as any;