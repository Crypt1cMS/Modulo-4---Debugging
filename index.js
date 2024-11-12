"use strict";
/*
  Customer states: Application generates a CSV export of personnel data;
  upon attempting to import this data to Microsoft SQL Server, data is
  corrupted; please diagnose and advise.

  CSV is formatted exactly as table is defined: (varchar, integer, varchar, varchar).
*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = __importDefault(require("node:fs"));
const node_process_1 = require("node:process");
function getConfigurationOptions(configFilePath) {
    try {
        const config = JSON.parse(node_fs_1.default.readFileSync(configFilePath).toString("utf-8"));
        if (!config.delimiter) {
            return {
                result: false,
                error: `Configuration file '${configFilePath}' has no 'delimiter' parameter.`,
            };
        }
        if (!config.hasHeaders) {
            return {
                result: false,
                error: `Configuration file '${configFilePath}' has no 'hasHeaders' parameter.`,
            };
        }
        if (!config.separator) {
            return {
                result: false,
                error: `Configuration file '${configFilePath}' has no 'separator' parameter.`,
            };
        }
        if (!config.terminator) {
            return {
                result: false,
                error: `Configuration file '${configFilePath}' has no 'terminator' parameter.`,
            };
        }
        return { result: true, options: config };
    }
    catch (error) {
        return { result: false, error: `${error}` };
    }
}
function validateData(data) {
    const schema = [
        { type: "varchar", fieldName: "name" },
        { type: "integer", fieldName: "age" },
        { type: "varchar", fieldName: "profession" },
        { type: "varchar", fieldName: "gender" }
    ];
    for (let rowIndex = 1; rowIndex < data.length; rowIndex++) {
        const row = data[rowIndex];
        // Check number of columns in the row
        if (row.length !== schema.length) {
            if (row.length > schema.length) {
                return {
                    isValid: false,
                    error: `Row ${rowIndex + 1} has more columns than expected. Expected ${schema.length} columns but found ${row.length}.`
                };
            }
            else {
                return {
                    isValid: false,
                    error: `Row ${rowIndex + 1} has fewer columns than expected. Expected ${schema.length} columns but found ${row.length}.`
                };
            }
        }
        // Validate each cell depending on the expected type
        for (let colIndex = 0; colIndex < schema.length; colIndex++) {
            const cell = row[colIndex];
            const { type, fieldName } = schema[colIndex];
            if (type === "varchar") {
                if (typeof cell !== "string" || !/^[a-zA-Z\s,]+$/.test(cell)) {
                    return { isValid: false, error: `Row ${rowIndex + 1}, Column ${colIndex + 1} (${fieldName}): Expected letters only.` };
                }
                if (cell.length > 50) {
                    return { isValid: false, error: `Row ${rowIndex + 1}, Column ${colIndex + 1} (${fieldName}): Exceeds 50 character limit.` };
                }
                // Gender - Only Male and Female
                const allowedGenders = ["Male", "Female", "male", "female"];
                if (fieldName === "gender" && !allowedGenders.includes(cell)) {
                    return { isValid: false, error: `Row ${rowIndex + 1}, Column ${colIndex + 1} (gender): Expected "Male" or "Female", but found "${cell}".` };
                }
            }
            else if (type === "integer") {
                // Validate age
                if (!/^\d+$/.test(cell)) {
                    return { isValid: false, error: `Row ${rowIndex + 1}, Column ${colIndex + 1} (${fieldName}): Expected an integer.` };
                }
                const age = parseInt(cell, 10);
                if (age < 18 || age > 125) {
                    return { isValid: false, error: `Row ${rowIndex + 1}, Column ${colIndex + 1} (age): Age must be between 0 and 125.` };
                }
                if (cell.length > 3) {
                    return { isValid: false, error: `Row ${rowIndex + 1}, Column ${colIndex + 1} (age): Age must not exceed three digits.` };
                }
            }
        }
    }
    return { isValid: true };
}
function parseCSV(filePath, options) {
    const csvData = node_fs_1.default
        .readFileSync(filePath, "utf-8")
        .toString()
        .replace(/\r\n/g, "\n");
    let currentState = undefined;
    const scanCharacter = (char, lookAhead, config, currentState) => {
        if (currentState === "insideDelimiter" && char !== config.delimiter) {
            return "insideDelimiter";
        }
        switch (char) {
            case config.delimiter:
                if (currentState === "insideDelimiter") {
                    return "endDelimiter";
                }
                return "startDelimiter";
            case config.separator:
                if (lookAhead !== config.delimiter && lookAhead !== config.terminator) {
                    return "error";
                }
                return "atSeparator";
            case config.terminator:
                if (lookAhead && lookAhead !== config.delimiter) {
                    return "error";
                }
                return "atTerminator";
            default:
                if (currentState === "startDelimiter" ||
                    currentState === "insideDelimiter") {
                    return "insideDelimiter";
                }
                return "error";
        }
    };
    const data = [];
    let currentDataArray = [];
    let currentPosition = 0;
    let currentWord = "";
    for (const character of csvData) {
        const lookAhead = currentPosition < csvData.length
            ? csvData[currentPosition + 1]
            : undefined;
        currentState = scanCharacter(character, lookAhead, options, currentState);
        console.info(`${currentPosition}: '${character}' : [${currentState}] => ${lookAhead}`);
        if (currentState === "startDelimiter") {
            currentWord = "";
        }
        if (currentState === "insideDelimiter") {
            currentWord += character;
        }
        if (currentState === "endDelimiter") {
            currentDataArray.push(currentWord);
            currentWord = "";
        }
        if (currentState === "atTerminator") {
            data.push(currentDataArray);
            currentDataArray = [];
        }
        if (currentState === "error") {
            return {
                isValid: false,
                error: `Character at position ${currentPosition} is invalid.`,
            };
        }
        currentPosition += 1;
    }
    if (currentDataArray.length > 0 || currentWord.trim() !== "") {
        currentDataArray.push(currentWord);
        currentDataArray.pop();
        data.push(currentDataArray);
    }
    console.info(data);
    return { isValid: true, data: data };
}
const filePath = node_process_1.argv[2];
const configPath = node_process_1.argv[3];
if (!filePath || !configPath) {
    console.error("File and configuration paths are required.");
    process.exit(1);
}
const configuration = getConfigurationOptions(configPath);
if (!configuration.result) {
    console.error(configuration.error);
    process.exit(1);
}
const csvData = parseCSV(filePath, configuration.options);
if (csvData.isValid && csvData.data) {
    const validationResult = validateData(csvData.data);
    if (!validationResult.isValid) {
        console.error(validationResult.error);
        process.exit(1);
    }
    console.info("CSV data is valid.");
}
else {
    // console.error(csvData.error)
    process.exit(1);
}
//# sourceMappingURL=index.js.map