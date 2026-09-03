import { Filter } from 'bad-words';
const filter = new Filter();
filter.addWords('bhenchod');
console.log(filter.isProfane('bhenchod ma ka bhosda'));
