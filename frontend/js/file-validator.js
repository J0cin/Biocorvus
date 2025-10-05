// js/file-validator.js

const FileValidator = {
    /**
     * Valida un archivo del lado del cliente basándose en extensión, tamaño y contenido
     * @param {File} file - El objeto File del input
     * @param {object} options - Opciones de configuración
     * @param {string[]} options.allowedExtensions - Array de extensiones permitidas 
     * @param {number} options.maxSizeMB - Tamaño máximo del archivo en Megabytes
     * @returns {Promise<{isValid: boolean, message: string}>} - Una promesa que resuelve a un objeto con el resultado.
     */
    async validate(file, options = {}) {
        const {
            allowedExtensions = ['.fastq', '.fq', '.fastq.gz', '.fq.gz', '.fasta', '.fa', '.fna'],
            maxSizeMB = 500
        } = options;

        // 1. Validación de Extensión
        const fileName = file.name;
        const isValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
        if (!isValidExtension) {
            return { isValid: false, message: `Invalid file type. Allowed: ${allowedExtensions.join(', ')}` };
        }

        // 2. Validación de Tamaño
        const maxSizeInBytes = maxSizeMB * 1024 * 1024;
        if (file.size > maxSizeInBytes) {
            return { isValid: false, message: `File too large (max ${maxSizeMB} MB).` };
        }

        // 3. Validación de Contenido ("Magic Numbers")
        return new Promise((resolve) => {
            const reader = new FileReader();
            const blob = file.slice(0, 2); // Leer solo los primeros 2 bytes

            reader.onloadend = (e) => {
                if (e.target.readyState !== FileReader.DONE) return;

                const view = new Uint8Array(e.target.result);
                
                if (fileName.endsWith('.gz')) {
                    if (view[0] === 0x1f && view[1] === 0x8b) {
                        resolve({ isValid: true, message: fileName });
                    } else {
                        resolve({ isValid: false, message: 'Error: Not a valid GZIP file.' });
                    }
                } else if (fileName.endsWith('.fastq') || fileName.endsWith('.fq')) {
                    const firstChar = String.fromCharCode(view[0]);
                    if (firstChar === '@') {
                        resolve({ isValid: true, message: fileName });
                    } else {
                        resolve({ isValid: false, message: 'Error: Not a valid FASTQ file (must start with @).' });
                    }
                } else if (fileName.endsWith('.fasta') || fileName.endsWith('.fa') || fileName.endsWith('.fna')) {
                    const firstChar = String.fromCharCode(view[0]);
                    if (firstChar === '>') {
                        resolve({ isValid: true, message: fileName });
                    } else {
                        resolve({ isValid: false, message: 'Error: Not a valid FASTA file (must start with >).' });
                    }
                } else {
                    // Si es una extensión permitida pero no tenemos una regla de contenido, la damos por válida.
                    resolve({ isValid: true, message: fileName });
                }
            };

            reader.onerror = () => {
                resolve({ isValid: false, message: 'Error reading file.' });
            };

            reader.readAsArrayBuffer(blob);
        });
    }
};