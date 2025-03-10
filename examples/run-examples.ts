/**
 * Script to run all MCPilot examples with structured output
 */

import { createProviderFactory, LogLevel } from '../src';
import { runExample as basicExample } from './basic-usage';
import * as configTest from './config-test';
import * as promptTemplates from './prompt-templates';
import * as mcpIntegration from './mcp-integration';
import * as path from 'path';
import * as fs from 'fs/promises';
import chalk from 'chalk';

interface Example {
    name: string;
    description: string;
    run: () => Promise<void>;
}

const examples: Example[] = [
    {
        name: 'Basic Usage',
        description: 'Demonstrates basic session management and message processing',
        run: basicExample
    },
    {
        name: 'Configuration',
        description: 'Shows how to load and validate configuration',
        run: configTest.testConfig
    },
    {
        name: 'Prompt Templates',
        description: 'Examples of using prompt templates and message formatting',
        run: promptTemplates.promptTemplateDemo
    },
    {
        name: 'MCP Integration',
        description: 'Demonstrates using MCP tools and resources',
        run: mcpIntegration.mcpIntegrationDemo
    }
];

interface RunResult {
    name: string;
    success: boolean;
    duration: number;
    error?: Error;
}

async function setupExampleEnvironment() {
    console.log(chalk.blue('\n📦 Setting up example environment...'));

    // Create examples directory if it doesn't exist
    const examplesDir = path.join(process.cwd(), 'examples', 'output');
    await fs.mkdir(examplesDir, { recursive: true });

    // Set up example environment variables
    process.env.MCPILOT_LOG_LEVEL = 'DEBUG';
    process.env.MCPILOT_LOG_DIR = path.join(examplesDir, 'logs');
    
    // Create provider factory
    const factory = createProviderFactory();
    
    console.log(chalk.green('✓ Environment ready\n'));
    return { examplesDir, factory };
}

async function runExample(example: Example): Promise<RunResult> {
    const startTime = Date.now();
    try {
        await example.run();
        return {
            name: example.name,
            success: true,
            duration: Date.now() - startTime
        };
    } catch (error) {
        return {
            name: example.name,
            success: false,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error : new Error(String(error))
        };
    }
}

function printHeader(text: string, pad: number = 2): void {
    const line = '═'.repeat(text.length + pad * 2);
    console.log(chalk.cyan(`\n╔${line}╗`));
    console.log(chalk.cyan(`║${' '.repeat(pad)}${text}${' '.repeat(pad)}║`));
    console.log(chalk.cyan(`╚${line}╝\n`));
}

function printResult(result: RunResult): void {
    const statusIcon = result.success ? chalk.green('✓') : chalk.red('✗');
    const duration = chalk.gray(`(${result.duration}ms)`);
    
    console.log(`${statusIcon} ${result.name} ${duration}`);
    
    if (!result.success && result.error) {
        console.log(chalk.red('  Error: ' + result.error.message));
        if (result.error.stack) {
            console.log(chalk.gray('  Stack: ' + result.error.stack.split('\n')[1]));
        }
    }
}

function printSummary(results: RunResult[]): void {
    const total = results.length;
    const successful = results.filter(r => r.success).length;
    const failed = total - successful;
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

    printHeader('Summary');
    console.log(chalk.bold(`Total Examples  : ${total}`));
    console.log(chalk.green(`Successful     : ${successful}`));
    console.log(chalk.red(`Failed         : ${failed}`));
    console.log(chalk.gray(`Total Duration : ${totalDuration}ms`));
}

async function runExamples() {
    try {
        printHeader('MCPilot Examples');

        console.log('Available examples:');
        examples.forEach((example, index) => {
            console.log(`${index + 1}. ${chalk.bold(example.name)}`);
            console.log(`   ${chalk.gray(example.description)}\n`);
        });

        await setupExampleEnvironment();

        const results: RunResult[] = [];
        for (const [index, example] of examples.entries()) {
            printHeader(`Running ${example.name} (${index + 1}/${examples.length})`);
            const result = await runExample(example);
            results.push(result);
            printResult(result);
        }

        printSummary(results);

        if (results.some(r => !r.success)) {
            process.exit(1);
        }
    } catch (error) {
        console.error(chalk.red('\nFailed to run examples:'));
        console.error(error);
        process.exit(1);
    }
}

// Run examples if executed directly
if (require.main === module) {
    const args = process.argv.slice(2);
    if (args.includes('--help') || args.includes('-h')) {
        printHeader('MCPilot Examples');
        console.log('Available examples:');
        examples.forEach((example, index) => {
            console.log(`${index + 1}. ${chalk.bold(example.name)}`);
            console.log(`   ${chalk.gray(example.description)}\n`);
        });
        process.exit(0);
    }

    runExamples().catch(error => {
        console.error(chalk.red('\nUnexpected error:'), error);
        process.exit(1);
    });
}

export { runExamples, examples, Example, RunResult };