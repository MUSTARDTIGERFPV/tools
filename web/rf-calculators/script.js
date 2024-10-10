// RF Power section
function calculatePower() {
    const powerInput = document.getElementById('powerInput').value;
    const unitToggle = document.getElementById('unitToggle');
    const unitLabel = document.getElementById('unitLabel');
    const powerOutputLabel = document.getElementById('powerOutputLabel');
    const powerOutput = document.getElementById('powerOutput');

    if (unitToggle.checked) {
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
document.getElementById('unitToggle').addEventListener('change', function() {
    // Swap the input and output values
    const powerInput = document.getElementById('powerInput').innerText;
    const powerOutput = document.getElementById('powerOutput').innerText;

    document.getElementById('powerInput').value = powerOutput;
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
