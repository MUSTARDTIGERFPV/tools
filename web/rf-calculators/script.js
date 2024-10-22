// RF Power section
function calculatePower() {
    const powerInput = document.getElementById('powerInput').value;
    const powerpowerUnitToggle = document.getElementById('powerUnitToggle');
    const powerUnitLabel = document.getElementById('powerUnitLabel');
    const powerOutputLabel = document.getElementById('powerOutputLabel');
    const powerOutput = document.getElementById('powerOutput');

    if (powerUnitToggle.checked) {
        // Convert mW to dBm
        const dBm = 10 * Math.log10(powerInput);
        powerOutputLabel.innerText = 'Power output (dBm)';
        powerOutput.innerText = dBm.toFixed(dBm % 1 === 0 ? 0 : 2);
    } else {
        // Convert dBm to mW
        const mW = Math.pow(10, powerInput / 10);
        powerOutputLabel.innerText = 'Power output (mW)';
        powerOutput.innerText = mW.toFixed(mW % 1 === 0 ? 0 : 2);
    }
}

// Update power data when switch toggles or when input power is set
document.getElementById('powerUnitToggle').addEventListener('change', function() {
    // Swap the input and output values
    const powerOutput = document.getElementById('powerOutput').innerText;

    powerInput.value = powerOutput;
    // Set the power unit label
    const powerUnitLabel = document.getElementById('powerUnitLabel');
    powerUnitLabel.innerText = powerUnitToggle.checked ? 'mW' : 'dBm';
    calculatePower();
});
document.getElementById('powerInput').addEventListener('input', calculatePower);
document.addEventListener('DOMContentLoaded', calculatePower);

// --------------------------------------------------------------------------------------------------------------------------------------

function calculateFSPL() {
    const frequencyInput = document.getElementById('fsplFrequency').value; // In MHz
    const distanceInput = document.getElementById('fsplDistance').value; // In km
    const fsplOutput = document.getElementById('fsplOutput');

    // Calculate the free space path loss
    const fspl = -1 * (20 * Math.log10(frequencyInput) + 20 * Math.log10(distanceInput) + 32.44);
    fsplOutput.innerText = fspl.toFixed(fspl % 1 === 0 ? 0 : 2);
}

document.getElementById('fsplFrequency').addEventListener('input', calculateFSPL);
document.getElementById('fsplDistance').addEventListener('input', calculateFSPL);
document.addEventListener('DOMContentLoaded', calculateFSPL);

// --------------------------------------------------------------------------------------------------------------------------------------

function calculateRange() {
    let frequency = parseFloat(document.getElementById('rangeFrequency').value); // In MHz
    const txPower = parseFloat(document.getElementById('rangeTXPower').value); // In dBm
    const txGain = parseFloat(document.getElementById('rangeTXGain').value); // In dBi
    const rxGain = parseFloat(document.getElementById('rangeRXGain').value); // In dBi
    const margin = parseFloat(document.getElementById('rangeMargin').value); // In dB
    const sensitivity = parseFloat(document.getElementById('rangeSensitivity').value); // In dBm
    const rangeOutputKM = document.getElementById('rangeOutputKM');
    const rangeOutputMI = document.getElementById('rangeOutputMI');

    const pathLoss = (txPower + txGain + rxGain - sensitivity - 32.45 + margin) - (20 * Math.log10(frequency));
    const range = Math.pow(10, pathLoss / 20);
    
    rangeOutputKM.innerText = range.toFixed(range % 1 === 0 ? 0 : 2);
    rangeOutputMI.innerText = (range * 0.621371).toFixed((range * 0.621371) % 1 === 0 ? 0 : 2);
}

document.getElementById('rangeFrequency').addEventListener('input', calculateRange);
document.getElementById('rangeTXPower').addEventListener('input', calculateRange);
document.getElementById('rangeTXGain').addEventListener('input', calculateRange);
document.getElementById('rangeRXGain').addEventListener('input', calculateRange);
document.getElementById('rangeMargin').addEventListener('input', calculateRange);
document.getElementById('rangeSensitivity').addEventListener('input', calculateRange);
document.addEventListener('DOMContentLoaded', calculateRange);

// --------------------------------------------------------------------------------------------------------------------------------------

function calculateInverseSquare() {
    const inverseSquareInput = document.getElementById('inverseSquareInput').value; // The change in dB
    const inverseSquareOutput = document.getElementById('inverseSquareOutput'); // Times further

    // Calculate the factor by which the distance has changed
    const factor = Math.pow(10, inverseSquareInput / 20);
    inverseSquareOutput.innerText = factor.toFixed(factor % 1 === 0 ? 0 : 2);
}

document.getElementById('inverseSquareInput').addEventListener('input', calculateInverseSquare);
document.addEventListener('DOMContentLoaded', calculateInverseSquare);

// --------------------------------------------------------------------------------------------------------------------------------------

function calculateWavelength() {
    const input = parseFloat(document.getElementById('wavelengthInput').value);
    const output1 = document.getElementById('wavelengthOutput1');
    const output1Label = document.getElementById('wavelengthOutput1Label');
    const output2 = document.getElementById('wavelengthOutput2');
    const output2Label = document.getElementById('wavelengthOutput2Label');

    const wavelengthUnitToggle = document.getElementById('wavelengthUnitToggle');
    
    const c = 299792458; // Speed of light in meters per second
    const cM = c / 1e6; // Speed of light in mega meters per second

    if (wavelengthUnitToggle.checked) {
        // Convert from meters to MHz
        const frequency = cM / input;

        // Set labels
        output1Label.innerText = 'Frequency (MHz)';
        output2Label.innerText = 'Frequency (GHz)';

        // Frequency in MHz
        output1.innerText = frequency.toFixed(frequency % 1 === 0 ? 0 : 2);
        // Frequency in GHz
        output2.innerText = (frequency / 1000).toFixed((frequency / 1000) % 1 === 0 ? 0 : 2);
    } else {
        // Convert from MHz to meters
        const wavelength = cM / input;

        // Set labels
        output1Label.innerText = 'Wavelength (m)';
        output2Label.innerText = 'Wavelength (cm)';

        // Wavelength in meters
        output1.innerText = wavelength.toFixed(wavelength % 1 === 0 ? 0 : 2);
        // Wavelength in cm
        output2.innerText = (wavelength * 100).toFixed((wavelength * 100) % 1 === 0 ? 0 : 2);
    }
}

document.getElementById('wavelengthUnitToggle').addEventListener('change', function() {
    const wavelengthOutput1 = document.getElementById('wavelengthOutput1');
    const wavelengthInput = document.getElementById('wavelengthInput');

    // Swap the input and output values
    wavelengthInput.value = wavelengthOutput1.innerText;

    // Set the unit label
    const wavelengthUnitLabel = document.getElementById('wavelengthUnitLabel');
    wavelengthUnitLabel.innerText = wavelengthUnitToggle.checked ? 'm' : 'MHz';
    
    calculateWavelength();
});

document.getElementById('wavelengthInput').addEventListener('input', calculateWavelength);
document.addEventListener('DOMContentLoaded', calculateWavelength);

// --------------------------------------------------------------------------------------------------------------------------------------

function calculateRSSI() {
    const frequency = parseFloat(document.getElementById('rssiFrequency').value); // In MHz
    const txPower = parseFloat(document.getElementById('rssiTXPower').value); // In dBm
    const txGain = parseFloat(document.getElementById('rssiTXGain').value); // In dBi
    const rxGain = parseFloat(document.getElementById('rssiRXGain').value); // In dBi
    const margin = parseFloat(document.getElementById('rssiMargin').value); // In dB
    const rssiKM = parseFloat(document.getElementById('rssiInputKM').value); // Input distance in KM
    const rssiOutput = document.getElementById('rssiOutput');

    // Convert range from kilometers to a linear scale for calculation
    const pathLoss = 20 * Math.log10(rssiKM) + 20 * Math.log10(frequency) + 32.45;
    
    // Calculate RSSI (sensitivity) based on the provided range
    const sensitivity = txPower + txGain + rxGain + margin - pathLoss;

    // Update the result
    rssiOutput.innerText = sensitivity.toFixed(sensitivity % 1 === 0 ? 0 : 2);
}

document.getElementById('rssiFrequency').addEventListener('input', calculateRSSI);
document.getElementById('rssiTXPower').addEventListener('input', calculateRSSI);
document.getElementById('rssiTXGain').addEventListener('input', calculateRSSI);
document.getElementById('rssiRXGain').addEventListener('input', calculateRSSI);
document.getElementById('rssiMargin').addEventListener('input', calculateRSSI);
document.getElementById('rssiInputKM').addEventListener('input', calculateRSSI);
document.addEventListener('DOMContentLoaded', calculateRSSI);

// --------------------------------------------------------------------------------------------------------------------------------------

function calculateBeamwidth() {
    const degToRad = function(degrees) {
        return degrees * (Math.PI / 180);
    }
    const degrees = parseFloat(document.getElementById('beamwidthDegrees').value);
    const distance = parseFloat(document.getElementById('beamwidthDistance').value);
    const beamwidthOutput = document.getElementById('beamwidthOutput');

    const width = 2 * distance * Math.tan(degToRad(degrees)/2);
    beamwidthOutput.innerText = width.toFixed(2);
}

document.getElementById('beamwidthDegrees').addEventListener('input', calculateBeamwidth);
document.getElementById('beamwidthDistance').addEventListener('input', calculateBeamwidth);
document.addEventListener('DOMContentLoaded', calculateBeamwidth);
