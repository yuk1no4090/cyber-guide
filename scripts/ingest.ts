/**
 * 知识库导入脚本
 * 将 knowledge_base/skills/*.md 文件切片、生成 embedding 并写入向量库
 * 
 * 运行方式: npm run ingest
 */

import fs from 'fs';
import path from 'path';
import { LocalIndex } from 'vectra';
import OpenAI from 'openai';

const KNOWLEDGE_BASE_PATH = path.join(process.cwd(), 'knowledge_base', 'skills');
const VECTOR_STORE_PATH = path.join(process.cwd(), 'vector_store');
const EMBEDDING_MODEL = 'text-embedding-3-small';

// 初始化 OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * 将文本切分成块
 */
function chunkText(text: string, chunkSize: number = 500): string[] {
  const chunks: string[] = [];
  const paragraphs = text.split(/\n\n+/);
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // 跳过空段落
    if (!paragraph.trim()) continue;
    
    if (currentChunk.length + paragraph.length < chunkSize) {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      
      if (paragraph.length > chunkSize) {
        // 长段落按句子切分
        const sentences = paragraph.split(/(?<=[。！？.!?])/);
        currentChunk = '';
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length < chunkSize) {
            currentChunk += sentence;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk.trim());
            }
            currentChunk = sentence;
          }
        }
      } else {
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * 生成 embedding
 */
async function createEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return response.data[0].embedding;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始导入知识库...\n');

  // 检查 API Key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ 错误: 请设置 OPENAI_API_KEY 环境变量');
    process.exit(1);
  }

  // 创建向量索引
  const index = new LocalIndex(VECTOR_STORE_PATH);
  
  if (await index.isIndexCreated()) {
    console.log('⚠️  发现已存在的向量库，将删除并重新创建...');
    // 删除旧的向量库
    fs.rmSync(VECTOR_STORE_PATH, { recursive: true, force: true });
  }
  
  await index.createIndex();
  console.log('✅ 向量索引已创建\n');

  // 读取所有 markdown 文件
  const files = fs.readdirSync(KNOWLEDGE_BASE_PATH)
    .filter(f => f.endsWith('.md'));
  
  console.log(`📚 发现 ${files.length} 个技能卡文件\n`);

  let totalChunks = 0;

  for (const file of files) {
    const filePath = path.join(KNOWLEDGE_BASE_PATH, file);
    const content = fs.readFileSync(filePath, 'utf-8');
    const skillName = file.replace('.md', '');
    
    console.log(`📄 处理: ${file}`);
    
    // 切分文本
    const chunks = chunkText(content);
    console.log(`   - 切分为 ${chunks.length} 个块`);
    
    // 为每个块生成 embedding 并存储
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        const embedding = await createEmbedding(chunk);
        
        await index.insertItem({
          vector: embedding,
          metadata: {
            content: chunk,
            source: skillName,
            chunkIndex: i,
            totalChunks: chunks.length,
          },
        });
        
        process.stdout.write(`   - 已处理 ${i + 1}/${chunks.length} 个块\r`);
      } catch (error) {
        console.error(`\n❌ 处理块 ${i} 时出错:`, error);
      }
      
      // 添加延迟避免 rate limit
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    console.log(`   ✅ 完成 (${chunks.length} 个块)`);
    totalChunks += chunks.length;
  }

  console.log(`\n🎉 导入完成！共处理 ${totalChunks} 个知识块`);
  console.log(`📁 向量库位置: ${VECTOR_STORE_PATH}`);
}

main().catch(console.error);

