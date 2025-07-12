import logo from './logo.svg';
import './App.css';
import React, {useState, useRef, useEffect} from 'react'
import Upload from "./Upload.jsx"
import Papa from 'papaparse'
import { GoogleGenAI } from "@google/genai"

function App() {
  const [files, setFiles] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const [columns, setColumns] = useState([])
  const [selectedColumns, setSelectedColumns] = useState({})
  const fileInputRef = useRef(null)
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupRef = useRef(null);
  const genAI = new GoogleGenAI({ apiKey: process.env.REACT_APP_API_KEY });


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
  const compileFiles = async () => {
    if (files.length > 0) {
      const csvFiles = files.filter(file => file.type === "text/csv");
      
      // First, parse all CSV files and collect their data
      const allFileData = await Promise.all(csvFiles.map(file => {
        return new Promise((resolve) => {
          Papa.parse(file, {
            header: true,
            complete: (results) => {
              const fileColumns = results.meta.fields || [];
              // Get sample data for each column
              const columnSamples = fileColumns.map(col => ({
                name: col,
                sample: results.data.length > 0 ? results.data[0][col] : null
              }))
              
              resolve({
                fileName: file.name,
                columns: columnSamples,
                data: results.data
              });
            }
          });
        });
      }));

      // Prepare data for single Gemini API call
      const allColumnsData = allFileData.map(fileData => ({
        fileName: fileData.fileName,
        columns: fileData.columns
      }));

      // Make single API call to Gemini with all file data
      const model = "gemini-2.5-flash";
      const prompt = `Given these multiple CSV files with their columns and sample values:
        ${JSON.stringify(allColumnsData, null, 2)}
        
        Create a unified schema that merges all these files. Output only a JSON string with:
        1. "unified_schema": Array of unified column names and types
        2. "mappings": Object where each key is a filename, and the value maps original column names to unified names as { "original": "unified" }
        
        Treat functionally identical or derivable columns as one, even if missing in some files. Ensure the unified schema covers all selected columns.`;

      try {
        const result = await genAI.models.generateContent({
          model: model,
          contents: prompt,
        });
        
        const responseText = result.text;
        console.log('Gemini Compile Response:', responseText);
        const cleanText = responseText.replace(/^```json\s*/, '').replace(/```$/, '').trim()
        console.log('Cleaned compile response:', cleanText)
        
        let unifiedMapping;
        try {
          unifiedMapping = JSON.parse(cleanText);
          // Validate the mapping structure
          if (!unifiedMapping.unified_schema || !unifiedMapping.mappings) {
            throw new Error('Invalid mapping structure');
          }
          console.log('Parsed Compile Unified Mapping:', unifiedMapping);
        } catch (parseError) {
          console.error('Error parsing Gemini response:', parseError);
          console.error('Raw response:', cleanText);
          setErrorMessage('Error processing column mappings. Please try again.');
          return;
        }

        // Get unified column names and set them as the displayed columns
        const unifiedColumnNames = unifiedMapping.unified_schema.map(col => col.name || col);
        setColumns(unifiedColumnNames);
        
        // Initialize selectedColumns with all unified columns selected
        const newSelectedColumns = {};
        unifiedColumnNames.forEach(col => {
          newSelectedColumns[col] = true;
        });
        setSelectedColumns(newSelectedColumns);
        
        // Store the unified mapping for use in download functions
        window.unifiedMapping = unifiedMapping;
        
        setIsPopupOpen(true);
        console.log("Unified columns:", unifiedColumnNames);
        console.log("Unified mapping stored:", unifiedMapping);
        
      } catch (error) {
        console.error('Error getting unified column mappings for compile:', error);
        setErrorMessage('Error communicating with AI. Please check your API key configuration.');
      }
    } else {
      setErrorMessage("Please upload files before compiling.");
    }
  };

  

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
    // Use the unified mapping that was created during compile
    const unifiedMapping = window.unifiedMapping;
    if (!unifiedMapping) {
      setErrorMessage('Please compile files first to generate unified schema.');
      return;
    }

    const csvFiles = files.filter(file => file.type === "text/csv")
    
    // Parse all CSV files and collect their data
    const allFileData = await Promise.all(csvFiles.map(file => {
      return new Promise((resolve) => {
        Papa.parse(file, {
          header: true,
          complete: (results) => {
            resolve({
              fileName: file.name,
              data: results.data
            });
          }
        })
      })
          }))

      // Get all selected unified column names
      const selectedUnifiedColumns = new Set();
      Object.entries(unifiedMapping.mappings).forEach(([fileName, mapping]) => {
        Object.entries(mapping).forEach(([oldCol, newCol]) => {
          if (selectedColumns[newCol]) {
            selectedUnifiedColumns.add(newCol);
          }
        });
      });

      // Process all files with the unified mapping
      const processedData = allFileData.map(fileData => {
        return fileData.data.map(row => {
          const newRow = {}
          // Get the file-specific mapping for this file
          const fileMapping = unifiedMapping.mappings[fileData.fileName] || {}
          
          // Apply the mapping to transform column names
          Object.entries(fileMapping).forEach(([oldCol, newCol]) => {
            // Check if the unified column is selected
            if (selectedColumns[newCol]) {
              newRow[newCol] = row[oldCol] || ''
            }
          })
          return newRow
        }).filter(newRow => {
          // Only include rows that have data for ALL selected columns
          return Array.from(selectedUnifiedColumns).every(selectedCol => {
            return newRow[selectedCol] !== undefined && 
                   newRow[selectedCol] !== null && 
                   newRow[selectedCol] !== '';
          });
        })
      })

      // Combine all the processed data
      const allData = processedData.flat()
      console.log('Final merged data (rectangular):', allData)
      console.log('Selected unified columns:', Array.from(selectedUnifiedColumns))
      
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

  const mergeAndDownloadMaximalCSV = async () => {
    // Use the unified mapping that was created during compile
    const unifiedMapping = window.unifiedMapping;
    if (!unifiedMapping) {
      setErrorMessage('Please compile files first to generate unified schema.');
      return;
    }

    const csvFiles = files.filter(file => file.type === "text/csv")
    
    // Parse all CSV files and collect their data
    const allFileData = await Promise.all(csvFiles.map(file => {
      return new Promise((resolve) => {
        Papa.parse(file, {
          header: true,
          complete: (results) => {
            resolve({
              fileName: file.name,
              data: results.data
            });
          }
        })
      })
          }))

      // Get all unified column names
      const unifiedColumnNames = unifiedMapping.unified_schema.map(col => col.name || col);

      // Process all files with the unified mapping for maximal data
      const mergedData = [];
      
      allFileData.forEach(fileData => {
        fileData.data.forEach(row => {
          const newRow = {};
          
          // Initialize all unified columns with empty values
          unifiedColumnNames.forEach(unifiedCol => {
            newRow[unifiedCol] = '';
          });
          
          // Get the file-specific mapping for this file
          const fileMapping = unifiedMapping.mappings[fileData.fileName] || {};
          
          // Apply the mapping to transform column names and fill data
          Object.entries(fileMapping).forEach(([oldCol, newCol]) => {
            if (row[oldCol] !== undefined && row[oldCol] !== null) {
              newRow[newCol] = row[oldCol];
            }
          });
          
          mergedData.push(newRow);
        });
      });

      console.log('Maximal merged data with unified schema:', mergedData);
      console.log('Unified column names:', unifiedColumnNames);
      
      // Create and download the CSV
      const csv = Papa.unparse(mergedData);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', 'maximal_merged_data.csv');
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
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
                <p>Download a file containing all possible data from all CSV files. This includes all columns from all files, with empty cells where data is missing.</p>
                <button className="btn btn--download" onClick={mergeAndDownloadMaximalCSV}>
                  <i className="bi bi-download h2"></i> Download</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
