import chalk from 'chalk';
import * as readline from 'readline';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

interface ProgressState {
  message: string;
  current: number;
  total: number;
  startTime: number;
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel = LogLevel.INFO;
  private progressState: ProgressState | null = null;
  private lastProgressLine = '';

  private constructor() {}

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  private clearProgressLine(): void {
    if (this.lastProgressLine) {
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      this.lastProgressLine = '';
    }
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.DEBUG) {
      this.clearProgressLine();
      console.log(chalk.gray(`${chalk.dim('●')} ${message}`), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.INFO) {
      this.clearProgressLine();
      console.log(`${chalk.blue('ℹ')} ${message}`, ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.WARN) {
      this.clearProgressLine();
      console.log(`${chalk.yellow('⚠')} ${chalk.yellow(message)}`, ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.logLevel <= LogLevel.ERROR) {
      this.clearProgressLine();
      console.log(`${chalk.red('✖')} ${chalk.red(message)}`, ...args);
    }
  }

  success(message: string, ...args: unknown[]): void {
    this.clearProgressLine();
    console.log(`${chalk.green('✔')} ${chalk.green(message)}`, ...args);
  }

  progress(message: string, current: number, total: number): void {
    if (!this.progressState || this.progressState.message !== message) {
      this.progressState = {
        message,
        current,
        total,
        startTime: Date.now(),
      };
    } else {
      this.progressState.current = current;
      this.progressState.total = total;
    }

    const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
    const barLength = 30;
    const filledLength = Math.floor((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    // Calculate ETA
    const elapsed = Date.now() - this.progressState.startTime;
    const rate = current > 0 ? current / (elapsed / 1000) : 0;
    const remaining = total - current;
    const eta = rate > 0 ? remaining / rate : 0;
    const etaStr = eta > 0 ? ` • ETA: ${this.formatTime(eta)}` : '';

    // Clear previous line and write new progress
    readline.clearLine(process.stdout, 0);
    readline.cursorTo(process.stdout, 0);

    const progressLine = `${chalk.cyan(bar)} ${chalk.bold(`${percentage}%`)} ${chalk.dim(`(${current}/${total})`)} ${message}${etaStr}`;
    process.stdout.write(progressLine);
    this.lastProgressLine = progressLine;

    // If complete, add a newline
    if (current >= total) {
      console.log(); // New line after completion
      this.lastProgressLine = '';
      this.progressState = null;
    }
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.round(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  }

  header(title: string, char = '='): void {
    this.clearProgressLine();
    const separator = char.repeat(title.length);
    console.log(chalk.bold.cyan(`\n${title}`));
    console.log(chalk.dim(separator));
  }

  section(title: string): void {
    this.clearProgressLine();
    console.log(chalk.bold(`\n▶ ${title}`));
  }

  item(message: string, icon = '•'): void {
    this.clearProgressLine();
    console.log(`  ${chalk.dim(icon)} ${message}`);
  }

  stats(stats: Record<string, number | string>): void {
    this.clearProgressLine();
    console.log();
    const maxKeyLength = Math.max(...Object.keys(stats).map(k => k.length));
    for (const [key, value] of Object.entries(stats)) {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(`  ${chalk.dim(paddedKey)} : ${chalk.bold(value)}`);
    }
  }

  table(headers: string[], rows: (string | number)[][]): void {
    this.clearProgressLine();

    // Calculate column widths
    const columnWidths = headers.map((header, index) => {
      const headerWidth = header.length;
      const maxRowWidth = Math.max(...rows.map(row => String(row[index] || '').length));
      return Math.max(headerWidth, maxRowWidth) + 2; // Add padding
    });

    // Print top border
    const topBorder = `┌${columnWidths.map(width => '─'.repeat(width)).join('┬')}┐`;
    console.log(chalk.gray(topBorder));

    // Print headers
    const headerRow = `│${headers
      .map((header, index) => {
        const paddedHeader = ` ${header} `.padEnd(columnWidths[index]);
        return chalk.bold.cyan(paddedHeader);
      })
      .join(chalk.gray('│'))}${chalk.gray('│')}`;
    console.log(headerRow);

    // Print header separator
    const separator = `├${columnWidths.map(width => '─'.repeat(width)).join('┼')}┤`;
    console.log(chalk.gray(separator));

    // Print rows
    rows.forEach(row => {
      const rowStr = `│${row
        .map((cell, index) => {
          const cellStr = ` ${cell} `.padEnd(columnWidths[index]);
          return typeof cell === 'number' ? chalk.yellow(cellStr) : cellStr;
        })
        .join(chalk.gray('│'))}${chalk.gray('│')}`;
      console.log(rowStr);
    });

    // Print bottom border
    const bottomBorder = `└${columnWidths.map(width => '─'.repeat(width)).join('┴')}┘`;
    console.log(chalk.gray(bottomBorder));
  }
}

export const logger = Logger.getInstance();
