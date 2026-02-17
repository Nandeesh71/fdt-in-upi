import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { useNavigate } from 'react-router-dom';

const QRScanner = () => {
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState(null);
  const [cameras, setCameras] = useState([]);
  const [selectedCamera, setSelectedCamera] = useState(null);
  const html5QrCode = useRef(null);
  const videoElemRef = useRef(null);

  useEffect(() => {
    // Get available cameras
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length) {
          setCameras(devices);
          // Try to select back camera for mobile
          const backCamera = devices.find(
            (device) => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('rear')
          );
          setSelectedCamera(backCamera?.id || devices[0].id);
        } else {
          setError('No cameras found on this device.');
        }
      })
      .catch((err) => {
        console.error('Error getting cameras:', err);
        setError('Failed to access camera. Please grant camera permissions.');
      });

    return () => {
      stopScanning();
    };
  }, []);

  const stopScanning = async () => {
    if (html5QrCode.current) {
      try {
        if (html5QrCode.current.isScanning) {
          await html5QrCode.current.stop();
        }
        html5QrCode.current.clear();
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  const startScanning = async () => {
    if (!selectedCamera) {
      setError('No camera selected');
      return;
    }

    try {
      setError(null);
      setScanning(true);

      if (!html5QrCode.current) {
        html5QrCode.current = new Html5Qrcode('qr-reader');
      }

      await html5QrCode.current.start(
        selectedCamera,
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        onScanSuccess,
        onScanFailure
      );
    } catch (err) {
      console.error('Error starting scanner:', err);
      setError('Failed to start scanner. Please try again.');
      setScanning(false);
    }
  };

  const onScanSuccess = (decodedText) => {
    console.log('QR Code scanned:', decodedText);
    
    // Stop scanning
    stopScanning();
    setScanning(false);

    // Parse UPI QR code
    if (decodedText.startsWith('upi://')) {
      try {
        const url = new URL(decodedText);
        const params = new URLSearchParams(url.search);
        
        const payeeAddress = params.get('pa') || '';
        const payeeName = decodeURIComponent(params.get('pn') || '');
        const amount = params.get('am') || '';
        const currency = params.get('cu') || 'INR';
        const transactionNote = decodeURIComponent(params.get('tn') || '');

        // Extract phone number from UPI ID (assuming format: phone@provider)
        const recipientPhone = payeeAddress.split('@')[0];

        if (recipientPhone && /^\d{10}$/.test(recipientPhone)) {
          // Navigate to SendMoney with pre-filled data
          navigate('/send-money', {
            state: {
              recipientPhone,
              amount: amount || '',
              scannedUPI: payeeAddress,
              payeeName: payeeName
            }
          });
        } else {
          setError('Invalid UPI ID format. Please try again.');
        }
      } catch (err) {
        console.error('Error parsing UPI QR code:', err);
        setError('Invalid QR code format. Please scan a valid UPI QR code.');
      }
    } else {
      setError('This is not a UPI payment QR code. Please scan a valid UPI QR code.');
    }
  };

  const onScanFailure = (error) => {
    // Ignore scan failures (happens continuously while scanning)
    // console.log('Scan failed:', error);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 pb-20">
      {/* Animated background */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-500 rounded-full filter blur-3xl opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-indigo-500 rounded-full filter blur-3xl opacity-20 animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <div className="bg-black/20 backdrop-blur-xl border-b border-white/10 text-white p-6 pb-8">
        <div className="flex items-center mb-2">
          <button
            onClick={() => {
              stopScanning();
              navigate('/dashboard');
            }}
            className="mr-4 text-purple-300 hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold">Scan QR Code</h1>
        </div>
        <p className="text-purple-300 text-sm ml-10">Scan a UPI QR code to make a payment</p>
      </div>

      {/* Content */}
      <div className="px-6 py-8 space-y-6">
        {error && (
          <div className="bg-red-500/20 border border-red-500/30 text-red-200 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Camera selection */}
        {cameras.length > 1 && (
          <div className="bg-white/10 backdrop-blur-xl rounded-xl p-4 border border-white/20">
            <label className="block text-sm font-medium text-purple-300 mb-2">Select Camera</label>
            <select
              value={selectedCamera || ''}
              onChange={(e) => {
                setSelectedCamera(e.target.value);
                if (scanning) {
                  stopScanning().then(() => {
                    setSelectedCamera(e.target.value);
                  });
                }
              }}
              disabled={scanning}
              className="w-full px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              {cameras.map((camera) => (
                <option key={camera.id} value={camera.id} className="bg-slate-800">
                  {camera.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Scanner */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-xl p-6 border border-white/20">
          <div 
            id="qr-reader" 
            ref={videoElemRef}
            className="w-full rounded-lg overflow-hidden mb-4"
            style={{ minHeight: scanning ? '300px' : '0px' }}
          ></div>

          {!scanning && (
            <div className="text-center py-8">
              <svg className="w-20 h-20 mx-auto text-purple-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
              </svg>
              <h3 className="text-white text-xl font-semibold mb-2">Ready to Scan</h3>
              <p className="text-purple-300 text-sm mb-6">
                Position the QR code within the frame to scan
              </p>
            </div>
          )}

          {/* Control Button */}
          {!scanning ? (
            <button
              onClick={startScanning}
              disabled={!selectedCamera}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white py-4 rounded-lg font-bold text-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Start Scanning</span>
            </button>
          ) : (
            <button
              onClick={() => {
                stopScanning();
                setScanning(false);
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-lg font-bold text-lg transition flex items-center justify-center space-x-3"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Stop Scanning</span>
            </button>
          )}
        </div>

        {/* Instructions */}
        <div className="bg-indigo-500/20 border border-indigo-500/30 rounded-xl p-4">
          <h4 className="text-white font-semibold mb-2 flex items-center">
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            How to use
          </h4>
          <ul className="text-purple-200 text-sm space-y-1 ml-7">
            <li>• Tap "Start Scanning" to activate the camera</li>
            <li>• Point your camera at a UPI QR code</li>
            <li>• Hold steady until the code is detected</li>
            <li>• You'll be redirected to payment page automatically</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default QRScanner;
