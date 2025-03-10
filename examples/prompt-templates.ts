/**
 * Example of using prompt templates and message formatting
 */

import { createSession, LogLevel } from '../src';
import { join } from 'path';

async function promptTemplateDemo() {
    // Create a new session
    const session = await createSession({
        logLevel: LogLevel.DEBUG
    });

    try {
        // Example of using a basic template
        const basicTemplate = `You are a helpful assistant. Current time is {{time}}.
User asked: {{question}}
Please provide a concise response.`;

        const response1 = await session.processMessage(
            basicTemplate.replace('{{time}}', new Date().toISOString())
                .replace('{{question}}', 'What is TypeScript?')
        );
        
        console.log('Basic Template Response:', response1.content);

        // Example of using a structured template
        const structuredTemplate = {
            role: 'system',
            content: 'You are an expert in {{domain}}.',
            parameters: {
                domain: 'TypeScript and software architecture'
            },
            examples: [
                {
                    input: 'How do I implement dependency injection?',
                    output: 'Here is a simple example of DI in TypeScript...'
                }
            ]
        };

        const response2 = await session.processMessage(
            JSON.stringify(structuredTemplate)
        );
        
        console.log('\nStructured Template Response:', response2.content);

        // Example of using a template file
        const templatePath = join(__dirname, 'templates', 'example.txt');
        const templateContent = `System: You are a coding assistant specializing in TypeScript.
History: User has asked about software design patterns.
Current request: {{request}}
Response format: Markdown`;

        const response3 = await session.processMessage(
            templateContent.replace(
                '{{request}}',
                'Explain the Observer pattern and show a TypeScript example.'
            )
        );
        
        console.log('\nTemplate File Response:', response3.content);

        // Clean up
        await session.endSession();

    } catch (error) {
        console.error('Error in prompt template demo:', error);
        await session.endSession();
        throw error;
    }
}

// Run the demo if executed directly
if (require.main === module) {
    promptTemplateDemo().catch(console.error);
}

export default promptTemplateDemo;