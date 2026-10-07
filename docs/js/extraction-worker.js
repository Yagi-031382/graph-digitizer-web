import {extractCurves} from './extraction.js';
self.onmessage=({data})=>{
  try{self.postMessage({id:data.id,candidates:extractCurves(data)});}
  catch(error){self.postMessage({id:data.id,error:error.message});}
};
