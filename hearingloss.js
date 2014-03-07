// hearing loss simulation using web audio API

//example usage:
if (false) {
  window.AudioContext = ( window.AudioContext || window.webkitAudioContext );
  var context = new AudioContext();
  var microphone = null;
  var simulator = null;

  navigator.getMedia = ( navigator.getUserMedia ||
                         navigator.webkitGetUserMedia ||
                         navigator.mozGetUserMedia ||
                         navigator.msGetUserMedia );
  navigator.getMedia({video:false, audio:true}, gotAudio);

  function gotAudio(stream) {
    alert('Put on some headphones or prepare for feedback!');
    microphone = context.createMediaStreamSource(stream);
    simulator = createPresbyacusisSimulation(context, 100, 40);
    microphone.connect(simulator.input);
    //var simulator = createCISimulation(context, 7, 200, 7000);
    simulator.output.connect(context.destination);
  }
}

function createPresbyacusisSimulation(context, frequency_cutoff, gain_value) {
  // low-pass filter
  
  // keep reference to all components -- seems to be necessary, presumably
  // to prevent garbage collection
  var components = new Array;
  
  var filter = context.createBiquadFilter();
  filter.type = filter.LOWPASS;
  filter.Q.value = 1;
  filter.frequency.value = frequency_cutoff;
  components[components.length] = filter;
  
  var gain = context.createGain();
  gain.gain.value = gain_value;
  
  filter.connect(gain);
  components[components.length] = gain;

  var processor = {frequency_cutoff: frequency_cutoff, gain: gain_value, input:filter, output:gain, components:components};
  return processor;
}

function createMenieresSimulation(context, frequency_cutoff, gain_value) {
  // high-pass filter
  
  // keep reference to all components -- seems to be necessary, presumably
  // to prevent garbage collection
  var components = new Array;
  
  var filter = context.createBiquadFilter();
  filter.type = filter.HIGHPASS;
  filter.Q.value = 1;
  filter.frequency.value = frequency_cutoff;
  components[components.length] = filter;
  
  var gain = context.createGain();
  gain.gain.value = gain_value;
  
  filter.connect(gain);
  components[components.length] = gain;

  var processor = {frequency_cutoff: frequency_cutoff, gain: gain_value, input:filter, output:gain, components:components};
  return processor;
}

function createCISimulation(context, n_channels, min_freq, max_freq) {
  // vocoder
  
  // keep reference to all components -- seems to be necessary, presumably
  // to prevent garbage collection
  var components = new Array;

  // gain node to make a single input node
  var inputNode = context.createGain();
  components[components.length] = inputNode;

  // gain node to make a single output node
  var outputNode = context.createGain();
  components[components.length] = outputNode;

  var n_channels = 7;

  var min_log = Math.log(min_freq);
  var max_log = Math.log(max_freq);
  var log_diff = (max_log-min_log)/n_channels;

  var corner_freqs = new Array;
  corner_freqs[0] = min_freq;
  for (ii=1;ii<=n_channels;ii++) {
    corner_freqs[ii] = Math.round(Math.pow(Math.exp(1), min_log+ii*log_diff));
  }

  for (ii = 0; ii<n_channels; ii++) {
    // filters
    var center_freq = Math.pow(corner_freqs[ii]*corner_freqs[ii+1], 1/2);
    var q = center_freq/(corner_freqs[ii+1]-corner_freqs[ii]);
    var filter = context.createBiquadFilter();
    filter.type = filter.BANDPASS;
    filter.frequency.value = center_freq;
    filter.Q.value = q;
    inputNode.connect(filter);
    components[components.length] = filter;

    // half-wave rectify
    var rectifier = createRectifierNode(context, true);
    filter.connect(rectifier);
    components[components.length] = rectifier;
  
    // multiply white noise and the envelope
    var modulator = createModulatorNode(context);
    rectifier.connect(modulator);
    components[components.length] = modulator;
    
    // connect to output node
    modulator.connect(outputNode);
  }

  var processor = {n_channels: n_channels, min_freq: min_freq, max_freq: max_freq, input:inputNode, output:outputNode, components:components};
  return processor;
}

function createRectifierNode(context, halfwave) {
  // set up rectification node
  // halfwave=true -> half-wave rectification; otherwise full-wave
  if (halfwave==true) {
    var mult = 0;
  }
  else {
    var mult = 1;
  }
  
  var n_samples = 32;
  var wsCurve = new Float32Array(n_samples);
  var middle = Math.ceil(n_samples/2);
  for (jj=0;jj<middle;jj++) {
    wsCurve[jj] = (middle-jj)/middle*mult;
  }
  for (jj=middle;jj<n_samples;jj++) {
    wsCurve[jj] = (jj-middle)/middle;
  }

  var waveShaper = context.createWaveShaper();
  waveShaper.curve = wsCurve;
  return waveShaper;
}

function createModulatorNode(context) {
  // set up white noise modulation node
  var node = context.createScriptProcessor();
  node.onaudioprocess = function(e) {
    for (var ch = 0; ch<2; ch++) {
      var input = e.inputBuffer.getChannelData(ch);
      var output = e.outputBuffer.getChannelData(ch);
      var bufferSize = input.length;
      for (var i = 0; i < bufferSize; i++) {
          output[i] = (Math.random()/2-0.5)*input[i];
          //output[i] = input[i];
      }
    }
  }
  return node;
}

function createEcho(context, delay, gain) {
  // repeating echo
  var components = new Array;  
  var delayNode = context.createDelay(2);
  delayNode.delayTime.value = delay;
  components[components.length] = delayNode;
  var gainNode = context.createGain();
  gainNode.gain.value = gain;
  components[components.length] = gainNode;
  delayNode.connect(gainNode);
  gainNode.connect(delayNode);
  
  var processor = {input:delayNode, output:gainNode, components:components};
  return processor;
}