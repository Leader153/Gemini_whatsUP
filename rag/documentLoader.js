/**
 * Document Loader для RAG
 * Загрузка документов всех форматов с поддержкой иврита
 */

const fs = require('fs').promises;
const path = require('path');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const { RecursiveCharacterTextSplitter } = require('@langchain/textsplitters');

/**
 * Загрузить и обработать документ
 * @param {string} filePath - Путь к файлу
 * @returns {Promise<Array>} Массив чанков документа
 */
async function loadDocument(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    let text = '';

    try {
        switch (ext) {
            case '.txt':
            case '.md':
                // Текстовые файлы с поддержкой UTF-8 (иврит)
                text = await fs.readFile(filePath, 'utf-8');
                break;

            case '.pdf':
                // PDF файлы
                const pdfBuffer = await fs.readFile(filePath);
                const pdfData = await pdf(pdfBuffer);
                text = pdfData.text;
                break;

            case '.docx':
                // DOCX файлы
                const docxBuffer = await fs.readFile(filePath);
                const result = await mammoth.extractRawText({ buffer: docxBuffer });
                text = result.value;
                break;

            default:
                throw new Error(`Неподдерживаемый формат файла: ${ext}`);
        }

        // Разбиение текста на чанки
        const textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize: 1000,
            chunkOverlap: 200,
        });

        const docs = await textSplitter.createDocuments([text], [
            { source: filePath, filename: path.basename(filePath) }
        ]);

        console.log(`✅ Загружен документ: ${path.basename(filePath)} (${docs.length} чанков)`);
        return docs;

    } catch (error) {
        console.error(`❌ Ошибка загрузки ${filePath}:`, error.message);
        throw error;
    }
}

/**
 * Загрузить все документы из папки
 * @param {string} folderPath - Путь к папке с документами
 * @returns {Promise<Array>} Массив всех чанков
 */
async function loadDocumentsFromFolder(folderPath) {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const supportedExts = ['.txt', '.md', '.pdf', '.docx'];
    const allDocs = [];

    for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
            // Рекурсивный вызов для подпапок
            console.log(`📁 Сканирование подпапки: ${entry.name}`);
            const subDocs = await loadDocumentsFromFolder(fullPath);
            allDocs.push(...subDocs);
        } else {
            const ext = path.extname(entry.name).toLowerCase();
            if (supportedExts.includes(ext)) {
                try {
                    const docs = await loadDocument(fullPath);
                    allDocs.push(...docs);
                } catch (error) {
                    console.error(`⚠️ Пропуск файла ${entry.name}:`, error.message);
                }
            }
        }
    }

    return allDocs;
}

module.exports = { loadDocument, loadDocumentsFromFolder };
