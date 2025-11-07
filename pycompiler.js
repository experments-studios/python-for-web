(function() {
    'use strict';

    let projectFiles = {}; 
    let lastCompiledCode = '';
    
    
    function bundleProject(fileName, visited = new Set()) {
        if (visited.has(fileName)) {
            throw new Error(`IMPORT LOOP: '${fileName}' has already been imported.`);
        }
        visited.add(fileName);

        const pyCode = projectFiles[fileName];
        if (!pyCode) {
            throw new Error(`IMPORT ERROR: '${fileName}' not found. Please check if the extension is '.py'.`);
        }

        const lines = pyCode.split('\n');
        let bundledCode = [];

        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // YENİ KOMUT: 'import dosya_adı'
            // Bu regex, 'import dosya_adı' veya 'from dosya_adı import *' gibi daha karmaşık bir yapıyı da yakalar, 
            // ancak sadece temel 'import dosya_adı' kısmını kullanacağız.
            const importMatch = trimmedLine.match(/^import\s+(\w+)$/);

            if (importMatch) {
                const libName = importMatch[1];
                const libFileName = libName + '.py'; // .py uzantısını ekle
                
                if (libFileName === fileName) continue; 

                try {
                    // Özyinelemeli olarak içe aktarılan dosyanın içeriğini al
                    const importedCode = bundleProject(libFileName, visited);
                    // İçeriği doğrudan birleştir (concatenation)
                    bundledCode.push(`\n` + importedCode + `\n`);
                } catch (e) {
                    if (e.message.includes('not found')) {
                         console.warn(`WARNING: Imported file '${libFileName}' not found. Skipping line.`);
                    } else {
                        throw e;
                    }
                }
            } else {
                bundledCode.push(line);
            }
        }
        
        visited.delete(fileName);
        return bundledCode.join('\n');
    }

    function compilePythonToJS(pyCode) {
        
        const lines = pyCode.split('\n');
        let jsOutput = `(function() {\n'use strict';\n`;
        
        let jsCodeBlockActive = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmedLine = line.trim();
            const indentMatch = line.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1] : '';

            
            if (trimmedLine.startsWith('#') || trimmedLine.length === 0) {
                jsOutput += line + '\n';
                continue;
            }

            let jsLine = '';

            
            if (i + 1 < lines.length) {
                 const nextLine = lines[i+1];
                 const nextIndentMatch = nextLine.match(/^(\s*)/);
                 const nextIndent = nextIndentMatch ? nextIndentMatch[1] : '';

                 if (nextIndent.length < indent.length) {
                    let currentIndent = indent;
                    let nextLineIndex = i + 1;
                    
                    while (nextLineIndex < lines.length) {
                        const nextLine_ = lines[nextLineIndex];
                        const nextIndent_ = nextLine_.match(/^(\s*)/)[1];
                        
                        if (nextIndent_.length < currentIndent.length && currentIndent.length > 0) {
                            jsOutput += '}\n';
                            currentIndent = nextIndent_;
                        } else {
                            break;
                        }
                        if (nextLine_.trim().length === 0 || nextLine_.trim().startsWith('#')) {
                            nextLineIndex++;
                        } else {
                            break;
                        }
                    }
                 }
            }

            const printMatch = trimmedLine.match(/^print\s*\((.*)\)$/);
            if (printMatch) {
                jsLine = `console.log(${printMatch[1].trim()});`;
            } 
            else if (trimmedLine.match(/^if\s+(.+)\s*:\s*$/)) {
                jsLine = `if (${RegExp.$1.trim()}) {`;
                jsCodeBlockActive = true;
            }
            else if (trimmedLine.match(/^elif\s+(.+)\s*:\s*$/)) {
                jsLine = `} else if (${RegExp.$1.trim()}) {`;
                jsCodeBlockActive = true;
            }
            else if (trimmedLine.match(/^else\s*:\s*$/)) {
                jsLine = `} else {`;
                jsCodeBlockActive = true;
            }
            else if (trimmedLine.match(/^for\s+(\w+)\s+in\s+range\s*\(([^)]+)\)\s*:\s*$/)) {
                 const varName = RegExp.$1;
                 const rangeArgs = RegExp.$2.split(',').map(a => a.trim());
                 
                 let init, limit;
                 if (rangeArgs.length === 1) {
                     init = '0';
                     limit = rangeArgs[0];
                 } else { 
                     init = rangeArgs[0];
                     limit = rangeArgs[1];
                 }

                 jsLine = `for (let ${varName} = ${init}; ${varName} < ${limit}; ${varName}++) {`;
                 jsCodeBlockActive = true;
            }
            else if (trimmedLine.match(/^while\s+(.+)\s*:\s*$/)) {
                jsLine = `while (${RegExp.$1.trim()}) {`;
                jsCodeBlockActive = true;
            }
            else if (trimmedLine.match(/^def\s+(\w+)\s*\(([^)]*)\)\s*:\s*$/)) {
                 const funcName = RegExp.$1;
                 const params = RegExp.$2.trim();
                 jsLine = `function ${funcName}(${params}) {`;
                 jsCodeBlockActive = true;
            }
            else if (trimmedLine.match(/^(return|break|continue)\s*(.*)$/)) {
                 jsLine = `${RegExp.$1} ${RegExp.$2.trim()};`;
            }
            else if (trimmedLine.match(/^(\w+)\s*=\s*(.*)$/)) {
                jsLine = `let ${RegExp.$1} = ${RegExp.$2.trim()};`;
            }
            // Ayrıca, bu 'import dosya_adı' satırını compilePythonToJS'te atlamalıyız, 
            // çünkü birleştirme aşamasında içeriği zaten eklenmiştir.
            else if (trimmedLine.match(/^import\s+(\w+)$/)) {
                 continue; // Birleştirme aşamasında ele alındı.
            }
            else {
                jsLine = `${trimmedLine.replace(/:$/, '')};`; 
            }
            
            if (jsLine) {
                jsOutput += indent + jsLine + '\n';
            } else {
                 throw new Error(`COMPILATION ERROR (Python Style): Unrecognized command line: ${trimmedLine}`);
            }
        }
        
        jsOutput += `\n}})();\n`;
        return jsOutput;
    }
    
    window.Zinstall = function() {
        if (!lastCompiledCode) {
            console.error("ERROR: Compilation not performed.");
            return;
        }
        const blob = new Blob([lastCompiledCode], {type: 'text/javascript;charset=utf-8'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Python_output.js'; 
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    async function processSelectedFiles(files) {
        projectFiles = {};
        
        let mainFileContent = null;
        let pyFileCount = 0;

        for (const file of files) {
            if (file.name.endsWith('.py')) {
                pyFileCount++;
                try {
                    const content = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = (e) => resolve(e.target.result);
                        reader.onerror = (e) => reject(e);
                        reader.readAsText(file, 'UTF-8');
                    });
                    projectFiles[file.name] = content;
                    if (file.name === 'main.py') {
                        mainFileContent = content;
                    }
                } catch (e) {
                    console.error(`ERROR: Could not read ${file.name}.`, e);
                    return; 
                }
            }
        }
        
        if (pyFileCount === 0 || !mainFileContent) {
            console.error("ERROR: No '.py' files found in the project or 'main.py' is missing.");
            return;
        }

        try {
            console.log("--- PYTHON-TO-JS COMPILATION STARTED ---");
            const bundledPyCode = bundleProject('main.py');
            
            const finalCompiledCode = compilePythonToJS(bundledPyCode); 
            lastCompiledCode = finalCompiledCode;

            console.log("--- COMPILATION SUCCESSFUL ---");
            console.log(finalCompiledCode);
            console.log("--- EXECUTION RESULT ---");
            eval(finalCompiledCode); 
            
            console.log("You can download the output using the Zinstall() command.");

        } catch (error) {
            console.error("CRITICAL ERROR:", error.message);
        }
    }

    window.ZStart = function() {
        console.clear();
        console.log("%cPYTHON-TO-JS COMPILER STARTED.", 'color: #00aaff; font-weight: bold;');
        console.log("Please select your '.py' project files, including 'main.py'.");

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.py';
        input.multiple = true;

        input.addEventListener('change', (event) => {
            const files = event.target.files;
            if (files.length > 0) {
                processSelectedFiles(files);
            }
            try {
                document.body.removeChild(input);
            } catch(e) {
                console.warn("Input element could not be removed.");
            }
        });

        input.style.display = 'none';
        document.body.appendChild(input);
        input.click();
    };

    console.log("Python-to-JS compiler code loaded. Call ZStart() to begin.");
})();
