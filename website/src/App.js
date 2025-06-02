import logo from './logo.svg';
import './App.css';
import React, {useState, useRef, useEffect} from 'react'
import Upload from "./Upload.jsx"
import Papa from 'papaparse'
import { GoogleGenerativeAI } from "@google/generative-ai"

function App() {
  const [files, setFiles] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const [columns, setColumns] = useState([])
  const [selectedColumns, setSelectedColumns] = useState({})
  const fileInputRef = useRef(null)
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupRef = useRef(null);
  const genAI = new GoogleGenerativeAI(process.env.REACT_APP_API_KEY);

  useEffect(() => {
    const handleEscapeKey = (event) => {
      if (event.key === 'Escape' && isPopupOpen) {
        closePopup();
      }
    };

    const handleClickOutside = (event) => {
      if (popupRef.current && !popupRef.current.contains(event.target) && isPopupOpen) {
        closePopup();
      }
    };

    document.addEventListener('keydown', handleEscapeKey);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPopupOpen]);

  const handleFiles = (newFiles) => {
    setErrorMessage("")
    const fileList = Array.from(newFiles);
    let goodCondition = true
    fileList.forEach(file => {
      const {name, type} = file
      if(type != "text/csv" && type != "application/sql") {
        console.log(type)
        goodCondition = false
        setErrorMessage("One of your files is not a supported data type.")
      }
    })
    if (goodCondition) {
      setFiles((prev) => [...prev, ...fileList]);
    }
  }

  const resetFiles = () => {
    setFiles([])
    setColumns([])
    setSelectedColumns({})
  }

  /*
  Desired behavior:
  - Read all uploaded files and extract all unique columns
  - Open popup with all unique columns
  - User can select which columns to include in the output
  - User can download the output as a CSV file (or other supported format)
  - Alternatively, user can attempt to compile files with as much data as possible, only including columns that have data in every file
  */
  const compileFiles = () => {
    if (files.length > 0) {
      // Read all CSV files and extract columns
      const csvFiles = files.filter(file => file.type === "text/csv")
      const allColumns = new Set()
      const fileData = []
      
      csvFiles.forEach(file => {
        Papa.parse(file, {
          header: true,
          complete: (results) => {
            const fileColumns = results.meta.fields || []
            fileColumns.forEach(col => allColumns.add(col))
            
            // Create JSON representation for this file
            const fileJson = {
              fileName: file.name,
              columns: fileColumns.map(columnName => {
                const sampleValue = results.data.length > 0 ? results.data[0][columnName] : null
                return {
                  name: columnName,
                  sampleValue: sampleValue
                }
              })
            }
            fileData.push(fileJson)
            
            // Update state with all unique columns
            setColumns(Array.from(allColumns))
            // Initialize selected columns
            const newSelectedColumns = {}
            Array.from(allColumns).forEach(col => {
              newSelectedColumns[col] = true
            })
            setSelectedColumns(newSelectedColumns)
            
            // Log the JSON representation [FOR TESTING PURPOSES]
            console.log(JSON.stringify(fileJson, null, 2))
          }
        })
      })
      setIsPopupOpen(true)
    } else {
      setErrorMessage("Please upload files before compiling.")
    }
  }

  

  const closePopup = () => {
    setIsPopupOpen(false)
  }

  const handleColumnToggle = (column) => {
    setSelectedColumns(prev => ({
      ...prev,
      [column]: !prev[column]
    }))

  }

  const mergeAndDownloadCSV = async () => {
    const csvFiles = files.filter(file => file.type === "text/csv")
    const mergedData = []
    
    // First, get all column mappings from each file
    const columnMappings = await Promise.all(csvFiles.map(async file => {
      return new Promise((resolve) => {
        Papa.parse(file, {
          header: true,
          complete: async (results) => {
            const fileColumns = results.meta.fields || []
            // Get sample data for each column
            const columnSamples = fileColumns.map(col => ({
              name: col,
              sample: results.data.length > 0 ? results.data[0][col] : null
            }))
            
            // Use Gemini to analyze column similarities
            const model = genAI.getGenerativeModel({ model: "gemini-pro" });
            const prompt = `Given databases with columns and sample values, merge them into one consistent schema. Output only a JSON string with a "unified_schema" (with "name" and "type") and "mappings". In "mappings", each entry should use the filename as the key, and map original column names to unified names as { original: unified }. Treat functionally identical or derivable columns as one, even if missing in some files.`;
            
            try {
              const result = await model.generateContent(prompt);
              const response = await result.response;
              const responseText = response.text();
              console.log('Gemini Response:', responseText); // Log the raw response
              
              let mapping;
              try {
                mapping = JSON.parse(responseText);
                // Validate the mapping structure
                if (!mapping.unified_schema || !mapping.mappings) {
                  throw new Error('Invalid mapping structure');
                }
                console.log('Parsed Mapping:', mapping); // Log the parsed mapping
              } catch (parseError) {
                console.error('Error parsing Gemini response:', parseError);
                console.error('Raw response:', responseText);
                setErrorMessage('Error processing column mappings. Please try again.');
                return;
              }
              
              resolve({ file, mapping, data: results.data });
            } catch (error) {
              console.error('Error getting column mappings:', error);
              setErrorMessage('Error communicating with AI. Please try again.');
              resolve({ file, mapping: {}, data: results.data });
            }
          }
        })
      })
    }))

    // Validate that we have valid mappings before proceeding
    const hasValidMappings = columnMappings.every(({ mapping }) => 
      mapping && mapping.unified_schema && mapping.mappings
    );

    if (!hasValidMappings) {
      setErrorMessage('Failed to generate valid column mappings. Please try again.');
      return;
    }

    // Process all files with their mappings
    const processedData = columnMappings.map(({ mapping, data }) => {
      return data.map(row => {
        const newRow = {}
        Object.entries(mapping.mappings).forEach(([oldCol, newCol]) => {
          if (selectedColumns[newCol]) {
            newRow[newCol] = row[oldCol] || ''
          }
        })
        return newRow
      })
    })

    // Combine all the processed data
    const allData = processedData.flat()
    
    // Create and download the CSV
    const csv = Papa.unparse(allData)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', 'merged_data.csv')
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="App">
      <h1>CompileAI</h1>
      <p>Your tool for efficiently combining databases.</p>
      <Upload onFilesSelected={handleFiles}/><br></br>
      <div className="button-container">
        <button className = "btn btn--compile" onClick = {compileFiles}>Compile</button>
        <button className = "btn btn--reset" onClick = {resetFiles}>Reset</button>
      </div>
      <p className = "errorMessage"> {errorMessage} </p>
      {files && (
        <>
          <div className = "fileList">
            <h3> Uploaded files: </h3>
            <ul>
              {files.map((file, index) => (
                <li key = {index} className = "fileItem"> {file.name} - {file.type} </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {isPopupOpen && (
        <div className="popup-overlay"> 
          <div className="popup-content" ref={popupRef}>
            <h2>Compilation Options</h2>
            <div className="compilation-options-container">
              <div className="compilation-option">
                <h3>Select Columns</h3>
                
                <div className="columns-container">
                  <div className="columns-list">
                    {columns.map((column, index) => (
                      <div key={index} className="column-item">
                        <input
                          type="checkbox"
                          id={`column-${index}`}
                          checked={selectedColumns[column]}
                          onChange={() => handleColumnToggle(column)}
                        />
                        <label htmlFor={`column-${index}`}>{column}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <button className="btn btn--download" onClick={mergeAndDownloadCSV}>
                  <i className="bi bi-download h2"></i> Download</button>
              </div>
              <div className="compilation-divider"></div>
              <div className="compilation-option">
                <h3>Use Maximal Data</h3>
                <p>Download a file containing all data from all CSV files, including only columns that have data in every file.</p>
                <button className="btn btn--download" onClick={() => {/* TODO: Implement maximal data download */}}>
                  <i class="bi bi-download h2"></i> Download</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
