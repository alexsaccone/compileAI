import { useRef } from 'react';

function Upload({ onFilesSelected }) {
  const fileInputRef = useRef(null);

  const handleClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (e) => {
    if (e.target.files.length > 0 && onFilesSelected) {
      onFilesSelected(e.target.files);
    }
  };

  return (
    <>
      <input
        type="file"
        className="fileInput"
        multiple
        ref={fileInputRef}
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <button className="btn btn--fileBox" onClick={handleClick}>
        <i class="bi bi-upload h2"></i> Upload Files</button>
    </>
  );
}

export default Upload;