
import * as P from './qa/verification/scratch/v13_probe.mjs';
const A=['Restored Three Companies','Closed Five Deals','Restored Full Access','Completed Final Migration','Restored Backup Yesterday','Completed Migration','Closed Deals Today','Restored Bob Smith','Completed Bob Smith Onboarding'];
const R=['Closed Loop Systems','Completed Works Ltd','Restored Timber Co'];
const accepted=A.filter(l=>P.label(l,'ACME Holdings')===l);
const realKept=R.filter(l=>P.label(l,l)===l);
const realSelectable=R.filter(l=>P.match(l.toLowerCase(),[{label:P.label(l,l),id:P.ACME,entityType:'company'}])!==null);
// D102/D103 seam
const r1=P.labels([{label:'Closed Loop Systems',id:P.ACME,entityType:'company'},{label:'Deleted The Project',id:P.ID2,entityType:'company'}],{companies:[{id:P.ACME,name:'Closed Loop Systems'},{id:P.ID2,name:'Closed Loop Systems'}]});
const o1=[{label:r1[0],id:P.ACME,entityType:'company'},{label:r1[1],id:P.ID2,entityType:'company'}];
const seam=P.match('closed loop systems',o1);
const r2=P.labels([{label:'the company',id:P.ACME,entityType:'company'},{label:'the company',id:P.ID2,entityType:'company'},{label:'the company (option 1)',id:'22222222-2222-2222-2222-222222222222',entityType:'company'}]);
console.log(JSON.stringify({assertion_labels_accepted:accepted,real_names_kept:realKept,real_names_selectable:realSelectable,seam_rendered:r1,seam_match:seam?seam.id:null,triple:r2,triple_unique:new Set(r2).size===r2.length}));
