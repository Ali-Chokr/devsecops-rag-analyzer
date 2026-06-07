import { Routes } from '@angular/router';
import { Dashboard } from './features/dashboard/dashboard';
import { JobsComponent } from './features/jobs/jobs.component';

export const routes: Routes = [
  { path: '', component: Dashboard },
  { path: 'jobs', component: JobsComponent },
  { path: '**', redirectTo: '' },
];
