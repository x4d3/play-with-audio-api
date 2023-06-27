function init() {
    let source;
    let displayValue = 'sine';
    let audioContext = new (window.AudioContext || window.webkitAudioContext)();
    let analyser = audioContext.createAnalyser();
    analyser.minDecibels = -100;
    analyser.maxDecibels = -10;
    analyser.smoothingTimeConstant = 0.85;
    if (!navigator?.mediaDevices?.getUserMedia) {
        // No audio allowed
        alert('Sorry, getUserMedia is required for the app.')
        return;
    }
    let constraints = {audio: true};
    navigator.mediaDevices.getUserMedia(constraints)
        .then(
            function (stream) {
                // Initialize the SourceNode
                source = audioContext.createMediaStreamSource(stream);
                // Connect the source node to the analyzer
                source.connect(analyser);
                visualize();
                document.getElementById('init').hidden = true;
            }
        )
        .catch(function (err) {
            alert(`Sorry, microphone permissions are required for the app. Feel free to read on without playing :) ${err}`);
        });


    const radioButtons = document.querySelectorAll('input[name="display"]');

    radioButtons.forEach((radioButton) => {
        radioButton.addEventListener('change', () => {
            displayValue = document.querySelector('input[name="display"]:checked').value;
        });
    });


    // Visualizing, copied from voice change o matic
    const canvas = document.querySelector('.visualizer');
    const canvasContext = canvas.getContext("2d");

    function visualize() {
        const width = canvas.width;
        const height = canvas.height;


        const draw = function () {
            requestAnimationFrame(draw);
            if (displayValue === 'sine') {
                drawWaveform();
            } else {
                drawFrequency();
            }
            drawNote();
        }
        const drawWaveform = function () {
            analyser.fftSize = 2048;
            let bufferLength = analyser.fftSize;
            let dataArray = new Uint8Array(bufferLength);
            analyser.getByteTimeDomainData(dataArray);

            canvasContext.fillStyle = 'rgb(200, 200, 200)';
            canvasContext.fillRect(0, 0, width, height);

            canvasContext.lineWidth = 2;
            canvasContext.strokeStyle = 'rgb(0, 0, 0)';

            canvasContext.beginPath();

            let sliceWidth = width * 1.0 / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {

                let v = dataArray[i] / 128.0;
                let y = v * height / 2;

                if (i === 0) {
                    canvasContext.moveTo(x, y);
                } else {
                    canvasContext.lineTo(x, y);
                }

                x += sliceWidth;
            }

            canvasContext.lineTo(canvas.width, canvas.height / 2);
            canvasContext.stroke();
        }


        let previousValueToDisplay = 0;
        let smoothingCount = 0;
        let smoothingThreshold = 5;
        let smoothingCountThreshold = 5;

        // Thanks to PitchDetect: https://github.com/cwilso/PitchDetect/blob/master/js/pitchdetect.js
        let noteStrings = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

        function noteFromPitch(frequency) {
            let noteNum = 12 * (Math.log(frequency / 440) / Math.log(2));
            return Math.round(noteNum) + 69;
        }

        const drawNote = function () {
            let bufferLength = analyser.fftSize;
            let buffer = new Float32Array(bufferLength);
            analyser.getFloatTimeDomainData(buffer);
            let autoCorrelateValue = autoCorrelate(buffer, audioContext.sampleRate)

            // Handle rounding
            let valueToDisplay = autoCorrelateValue;

            let smoothingValue = document.querySelector('input[name="smoothing"]:checked').value


            if (autoCorrelateValue === -1) {
                document.getElementById('note').innerText = 'Too quiet...';
                return;
            }
            if (smoothingValue === 'none') {
                smoothingThreshold = 99999;
                smoothingCountThreshold = 0;
            } else if (smoothingValue === 'basic') {
                smoothingThreshold = 10;
                smoothingCountThreshold = 5;
            } else if (smoothingValue === 'very') {
                smoothingThreshold = 5;
                smoothingCountThreshold = 10;
            }

            function noteIsSimilarEnough() {
                // Check threshold for number, or just difference for notes.
                if (typeof (valueToDisplay) == 'number') {
                    return Math.abs(valueToDisplay - previousValueToDisplay) < smoothingThreshold;
                } else {
                    return valueToDisplay === previousValueToDisplay;
                }
            }

            // Check if this value has been within the given range for n iterations
            if (noteIsSimilarEnough()) {
                if (smoothingCount < smoothingCountThreshold) {
                    smoothingCount++;
                    return;
                } else {
                    previousValueToDisplay = valueToDisplay;
                    smoothingCount = 0;
                }
            } else {
                previousValueToDisplay = valueToDisplay;
                smoothingCount = 0;
                return;
            }

            const note = noteStrings[noteFromPitch(valueToDisplay) % 12];

            document.getElementById('note').innerText = `${Math.round(valueToDisplay)} Hz - ${note}`;
        }

        const drawFrequency = function () {
            let bufferLengthAlt = analyser.frequencyBinCount;
            let dataArrayAlt = new Uint8Array(bufferLengthAlt);

            canvasContext.clearRect(0, 0, width, height);


            analyser.getByteFrequencyData(dataArrayAlt);

            canvasContext.fillStyle = 'rgb(0, 0, 0)';
            canvasContext.fillRect(0, 0, width, height);

            let barWidth = (width / bufferLengthAlt) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLengthAlt; i++) {
                barHeight = dataArrayAlt[i];

                canvasContext.fillStyle = 'rgb(' + (barHeight + 100) + ',50,50)';
                canvasContext.fillRect(x, height - barHeight / 2, barWidth, barHeight / 2);

                x += barWidth + 1;
            }

        }
        draw();
        drawNote();
    }
}


// Must be called on analyser.getFloatTimeDomainData and audioContext.sampleRate
// From https://github.com/cwilso/PitchDetect/pull/23
function autoCorrelate(buffer, sampleRate) {
    // Perform a quick root-mean-square to see if we have enough signal
    let SIZE = buffer.length;
    let sumOfSquares = 0;
    for (let i = 0; i < SIZE; i++) {
        let val = buffer[i];
        sumOfSquares += val * val;
    }
    let rootMeanSquare = Math.sqrt(sumOfSquares / SIZE)
    if (rootMeanSquare < 0.01) {
        return -1;
    }

    // Find a range in the buffer where the values are below a given threshold.
    let r1 = 0;
    let r2 = SIZE - 1;
    let threshold = 0.2;

    // Walk up for r1
    for (let i = 0; i < SIZE / 2; i++) {
        if (Math.abs(buffer[i]) < threshold) {
            r1 = i;
            break;
        }
    }

    // Walk down for r2
    for (let i = 1; i < SIZE / 2; i++) {
        if (Math.abs(buffer[SIZE - i]) < threshold) {
            r2 = SIZE - i;
            break;
        }
    }

    // Trim the buffer to these ranges and update SIZE.
    buffer = buffer.slice(r1, r2);
    SIZE = buffer.length

    // Create a new array of the sums of offsets to do the autocorrelation
    let c = new Array(SIZE).fill(0);
    // For each potential offset, calculate the sum of each buffer value times its offset value
    for (let i = 0; i < SIZE; i++) {
        for (let j = 0; j < SIZE - i; j++) {
            c[i] = c[i] + buffer[j] * buffer[j + i]
        }
    }

    // Find the last index where that value is greater than the next one (the dip)
    let d = 0;
    while (c[d] > c[d + 1]) {
        d++;
    }

    // Iterate from that index through the end and find the maximum sum
    let maxValue = -1;
    let maxIndex = -1;
    for (let i = d; i < SIZE; i++) {
        if (c[i] > maxValue) {
            maxValue = c[i];
            maxIndex = i;
        }
    }

    let T0 = maxIndex;

    // Not as sure about this part, don't @ me
    // From the original author:
    // interpolation is parabolic interpolation. It helps with precision. We suppose that a parabola pass through the
    // three points that comprise the peak. 'a' and 'b' are the unknowns from the linear equation system and b/(2a) is
    // the "error" in the abscissa. Well x1,x2,x3 should be y1,y2,y3 because they are the ordinates.
    let x1 = c[T0 - 1];
    let x2 = c[T0];
    let x3 = c[T0 + 1]

    let a = (x1 + x3 - 2 * x2) / 2;
    let b = (x3 - x1) / 2
    if (a) {
        T0 = T0 - b / (2 * a);
    }

    return sampleRate / T0;
}