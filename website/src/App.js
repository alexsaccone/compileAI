import logo from './logo.svg';
import './App.css';

import React, {useState, useRef} from 'react'


function App() {
  const [files, setFiles] = useState([])
  const [errorMessage, setErrorMessage] = useState("")
  const fileInputRef = useRef(null)

  const handleFiles = (newFiles) => {
    setErrorMessage("")
    const fileList = Array.from(newFiles);
    let goodCondition = true
    fileList.forEach(file => {
      const {name, type} = file
      if(type != "text/csv" && type != "application/sql") {
        console.log(type)
        goodCondition = false
        setErrorMessage("One of your files is not a supported data type")
      }
    })
    if (goodCondition) {
      setFiles((prev) => [...prev, ...fileList]);
    }
  }

  const resetFiles = () => {
    setFiles([])
  }


  return (
    <div className="App">
      <h1> CompileAI </h1>
      <div className = "fileBox">
        <input className = "fileInput" type="file" multiple ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)}/>
        <p className = "errorMessage"> {errorMessage} </p>
      </div>
      <button className = "rbtn" onClick = {resetFiles}> Reset </button>
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
    </div>
  );
}

export default App;
