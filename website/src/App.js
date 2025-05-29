import logo from './logo.svg';
import './App.css';
import React, {useState, useRef, useEffect} from 'react'
import Upload from "./Upload.jsx"
import Papa from 'papaparse'

function App() {
  const [files, setFiles] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const [columns, setColumns] = useState([])
  const [selectedColumns, setSelectedColumns] = useState({})
  const fileInputRef = useRef(null)
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const popupRef = useRef(null);

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

  const compileFiles = () => {
    if (files.length > 0) {
      // Read all CSV files and extract columns
      const csvFiles = files.filter(file => file.type === "text/csv")
      const allColumns = new Set()
      
      csvFiles.forEach(file => {
        Papa.parse(file, {
          header: true,
          complete: (results) => {
            const fileColumns = results.meta.fields || []
            fileColumns.forEach(col => allColumns.add(col))
            setColumns(Array.from(allColumns))
            // Initialize selected columns
            const newSelectedColumns = {}
            Array.from(allColumns).forEach(col => {
              newSelectedColumns[col] = true
            })
            setSelectedColumns(newSelectedColumns)
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
            <div className="columns-container">
              <h3>Select Columns to Include:</h3>
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
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
