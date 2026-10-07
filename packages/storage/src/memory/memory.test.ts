import { describeRepositoryConformance } from '../testing';
import { createMemoryRepository } from '.';

describeRepositoryConformance('memory', () => Promise.resolve(createMemoryRepository()));
