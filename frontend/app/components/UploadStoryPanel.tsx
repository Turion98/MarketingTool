"use client";
import React, { useState } from "react";
import UploadStoryForm from "./UploadStoryForm/UploadStoryForm";
import styles from "./LandingPage/LandingPage.module.scss";

export default function UploadStoryPanel() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Nyitó/Záró gomb */}
      <button
        onClick={() => setOpen((prev) => !prev)}   // ⬅️ toggle
        className={styles.uploadButton}
      >
        {open ? "Bezárás" : "Új story feltöltése"}
      </button>

      {/* Modal overlay */}
      {open && (
        <div
          className="fixed inset-0 z-[4000] bg-black/60 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="relative bg-[#1b1b1b] rounded-xl shadow-2xl max-h-[90vh] overflow-auto w-full max-w-2xl p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-white">Story uploader</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-sm px-2 py-1 rounded-md border text-gray-300 hover:bg-gray-700"
              >
                Close
              </button>
            </div>

            <UploadStoryForm />
          </div>
        </div>
      )}
    </>
  );
}
