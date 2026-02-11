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

            case '.csv':
                // CSV файлы
                const csvText = await fs.readFile(filePath, 'utf-8');
                const parsedData = parseCSV(csvText);
                text = parsedData.map(row =>
                    Object.entries(row)
                        .map(([key, value]) => `${key}: ${value}`)
                        .join('\n')
                ).join('\n\n---\n\n');
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
    const supportedExts = ['.txt', '.md', '.pdf', '.docx', '.csv'];
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

/**
 * Парсер CSV (с поддержкой кавычек и запятых внутри)
 * @param {string} text - Содержимое CSV файла
 * @returns {Array<Object>} Массив объектов, где ключи - заголовки
 */
function parseCSV(text) {
    const lines = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;

    // Нормализация переносов строк
    const normalizedText = text.replace(/\r\n/g, '\n');

    for (let i = 0; i < normalizedText.length; i++) {
        const char = normalizedText[i];
        const nextChar = normalizedText[i + 1];

        if (inQuotes) {
            if (char === '"' && nextChar === '"') {
                // Экранированная кавычка
                currentField += '"';
                i++; // Пропускаем следующую кавычку
            } else if (char === '"') {
                // Конец кавычек
                inQuotes = false;
            } else {
                currentField += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                // Конец поля
                currentRow.push(currentField.trim());
                currentField = '';
            } else if (char === '\n') {
                // Конец строки
                currentRow.push(currentField.trim());
                lines.push(currentRow);
                currentRow = [];
                currentField = '';
            } else {
                currentField += char;
            }
        }
    }
    // Добавляем последнее поле/строку если есть
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        lines.push(currentRow);
    }

    if (lines.length < 2) return [];

    const headers = lines[0];
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        const row = lines[i];
        if (row.length === headers.length) {
            const obj = {};
            headers.forEach((header, index) => {
                obj[header] = row[index];
            });
            data.push(obj);
        }
    }
    return data;
}

module.exports = { loadDocument, loadDocumentsFromFolder, parseCSV };
