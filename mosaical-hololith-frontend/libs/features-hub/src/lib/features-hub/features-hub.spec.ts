import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FeaturesHub } from './features-hub';

describe('FeaturesHub', () => {
  let component: FeaturesHub;
  let fixture: ComponentFixture<FeaturesHub>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FeaturesHub],
    }).compileComponents();

    fixture = TestBed.createComponent(FeaturesHub);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
